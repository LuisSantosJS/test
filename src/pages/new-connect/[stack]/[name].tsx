import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import Image from "next/image";

// Interface para o status da instância
interface InstanceStatus {
    name: string;
    status: "open" | "qr" | "close";
    qrcode?: string;
    phone?: string;
    pushname?: string;
    timestamp: number;
}

// Interface para a resposta do pairing code
interface PairingCodeResponse {
    name: string;
    pairingCode: string;
    phoneNumber: string;
    message: string;
    expiresIn: string;
    timestamp: number;
}

interface ConnectInstanceProps {
    stack: string;
    instanceName: string;
}

type ConnectionMode = "qr" | "pairing";

const ConnectInstance = ({ stack, instanceName }: ConnectInstanceProps) => {
    const [status, setStatus] = useState<InstanceStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(false);

    // Estados para Pairing Code
    const [connectionMode, setConnectionMode] = useState<ConnectionMode>("qr");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [generatingPairingCode, setGeneratingPairingCode] = useState(false);
    const [pairingCodeExpiry, setPairingCodeExpiry] = useState<number | null>(null);

    // Cooldown contra clique múltiplo no Conectar/Recarregar — evita que
    // chamadas repetidas em /public/connect interrompam o whatsmeow antes
    // dele entregar o QR (causa do loop de "Connection loop didn't exit").
    const [cooldownUntil, setCooldownUntil] = useState<number>(0);
    const [, setCooldownTick] = useState<number>(0);

    // Ref para controlar se o componente está montado
    const isMounted = useRef(true);
    // Ref para o handle do próximo poll (usamos setTimeout recursivo para
    // suportar backoff exponencial em caso de erro)
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);
    // Ref para o countdown do pairing code
    const expiryInterval = useRef<NodeJS.Timeout | null>(null);
    // Erros consecutivos no fetchStatus — alimentam o backoff
    const consecutiveErrors = useRef<number>(0);

    // Construir URL base do endpoint usando o stack como subdomínio
    const API_BASE = `https://${stack}.datalitics.app`;

    // Buscar status da instância
    const fetchStatus = useCallback(async () => {
        if (!isMounted.current) return;

        try {
            const timestamp = Date.now();
            const response = await fetch(
                `${API_BASE}/public/instances/${instanceName}/status?_t=${timestamp}`
            );

            if (!isMounted.current) return;

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error("Instância não encontrada");
                }
                throw new Error("Erro ao buscar status");
            }

            const data: InstanceStatus = await response.json();

            if (!isMounted.current) return;

            setStatus(data);
            setError(null);
            consecutiveErrors.current = 0;

            // Limpar pairing code se conectou
            if (data.status === "open") {
                setPairingCode(null);
                setPairingCodeExpiry(null);
            }
        } catch (err) {
            if (!isMounted.current) return;
            consecutiveErrors.current += 1;
            setError(err instanceof Error ? err.message : "Erro desconhecido");
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, [instanceName, API_BASE]);

    // Conectar/Gerar QR Code
    const connectInstance = async () => {
        if (!isMounted.current) return;

        setConnecting(true);
        setError(null);
        setPairingCode(null);
        // Limpar QR antigo imediatamente — evita usuário escanear código já
        // invalidado pelo POST /connect que acabou de matar a sessão anterior.
        setStatus((prev) => (prev ? { ...prev, qrcode: undefined, status: "close" } : prev));

        try {
            const response = await fetch(
                `${API_BASE}/public/instances/${instanceName}/connect`,
                { method: "POST" }
            );

            if (!isMounted.current) return;

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Erro ao conectar");
            }

            // Polling até o backend produzir QR/open. whatsmeow normalmente
            // entrega o primeiro QR em 2-5s; janela de 15s cobre redes lentas.
            const deadline = Date.now() + 15000;
            while (Date.now() < deadline && isMounted.current) {
                await new Promise((r) => setTimeout(r, 800));
                if (!isMounted.current) return;
                try {
                    const sr = await fetch(
                        `${API_BASE}/public/instances/${instanceName}/status?_t=${Date.now()}`
                    );
                    if (!sr.ok) continue;
                    const data: InstanceStatus = await sr.json();
                    if (!isMounted.current) return;
                    setStatus(data);
                    setError(null);
                    consecutiveErrors.current = 0;
                    if (data.status === "qr" || data.status === "open") {
                        break;
                    }
                } catch {
                    // mantém o polling até o deadline
                }
            }
        } catch (err) {
            if (isMounted.current) {
                setError(err instanceof Error ? err.message : "Erro ao conectar");
            }
        } finally {
            if (isMounted.current) {
                setConnecting(false);
            }
        }
    };

    // Wrapper com cooldown — único ponto de entrada dos botões "Conectar"
    // e "Recarregar QR Code". Bloqueia cliques repetidos por 15s para não
    // matar o connection loop do worker antes do QR aparecer.
    const COOLDOWN_MS = 15000;
    const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    const isCooldownActive = cooldownRemaining > 0;

    const requestConnect = () => {
        if (connecting || isCooldownActive) return;
        setCooldownUntil(Date.now() + COOLDOWN_MS);
        connectInstance();
    };

    // Tick do contador do cooldown — força re-render a cada 250ms para o
    // botão atualizar "Aguarde Xs". Para sozinho quando o cooldown expira.
    useEffect(() => {
        if (!isCooldownActive) return;
        const t = setInterval(() => setCooldownTick(Date.now()), 250);
        return () => clearInterval(t);
    }, [isCooldownActive]);

    // Gerar Pairing Code
    const generatePairingCode = async () => {
        if (!isMounted.current) return;

        // Validar número de telefone
        const cleanPhone = phoneNumber.replace(/\D/g, "");
        if (cleanPhone.length < 10) {
            setError("Digite um número de telefone válido");
            return;
        }

        setGeneratingPairingCode(true);
        setError(null);
        setPairingCode(null);

        try {
            const response = await fetch(
                `${API_BASE}/public/instances/${instanceName}/pairing-code`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ phoneNumber: cleanPhone }),
                }
            );

            if (!isMounted.current) return;

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Erro ao gerar código de pareamento");
            }

            const data: PairingCodeResponse = await response.json();

            if (!isMounted.current) return;

            setPairingCode(data.pairingCode);
            // Iniciar countdown de 160 segundos
            setPairingCodeExpiry(160);
        } catch (err) {
            if (isMounted.current) {
                setError(err instanceof Error ? err.message : "Erro ao gerar código");
            }
        } finally {
            if (isMounted.current) {
                setGeneratingPairingCode(false);
            }
        }
    };

    // Formatar o código de pareamento (XXXX-XXXX)
    const formatPairingCode = (code: string): string => {
        if (code.length === 8) {
            return `${code.slice(0, 4)}-${code.slice(4)}`;
        }
        return code;
    };

    // Countdown do pairing code — quando expira, limpa também o código exibido
    // pra usuário não tentar usar um número que o backend já vai recusar.
    useEffect(() => {
        if (pairingCodeExpiry !== null && pairingCodeExpiry > 0) {
            expiryInterval.current = setInterval(() => {
                setPairingCodeExpiry((prev) => {
                    if (prev === null || prev <= 1) {
                        if (expiryInterval.current) {
                            clearInterval(expiryInterval.current);
                        }
                        setPairingCode(null);
                        return null;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (expiryInterval.current) {
                clearInterval(expiryInterval.current);
            }
        };
    }, [pairingCode]);

    // Buscar status inicial e configurar polling com backoff exponencial.
    // setTimeout recursivo (em vez de setInterval) permite ajustar o intervalo
    // dinamicamente entre tentativas: 3s normal, dobrando até 30s em caso de
    // erros consecutivos. Reseta para 3s no primeiro 200.
    useEffect(() => {
        isMounted.current = true;
        let cancelled = false;

        const scheduleNext = () => {
            if (cancelled || !isMounted.current) return;
            const errs = consecutiveErrors.current;
            const delay = errs === 0 ? 3000 : Math.min(30000, 3000 * Math.pow(2, errs - 1));
            pollingInterval.current = setTimeout(tick, delay);
        };

        const tick = async () => {
            if (cancelled || !isMounted.current) return;
            if (!connecting) {
                await fetchStatus();
            }
            scheduleNext();
        };

        // Primeiro fetch imediato + agenda os próximos.
        (async () => {
            await fetchStatus();
            scheduleNext();
        })();

        return () => {
            cancelled = true;
            isMounted.current = false;
            if (pollingInterval.current) {
                clearTimeout(pollingInterval.current);
                pollingInterval.current = null;
            }
            if (expiryInterval.current) {
                clearInterval(expiryInterval.current);
                expiryInterval.current = null;
            }
        };
    }, [fetchStatus, connecting]);

    // Parar polling quando status for "open"
    useEffect(() => {
        if (status?.status === "open" && pollingInterval.current) {
            clearTimeout(pollingInterval.current);
            pollingInterval.current = null;
        }
    }, [status?.status]);

    return (
        <>
            <Head>
                <title>Contato | Conectando</title>
                <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
                <meta httpEquiv="Pragma" content="no-cache" />
                <meta httpEquiv="Expires" content="0" />
            </Head>

            {/* Container Principal */}
            <div
                className="min-h-screen flex items-center justify-center p-5"
                style={{
                    backgroundColor: "#e5e5e5",
                    backgroundImage: 'url("/wp.png")',
                    backgroundRepeat: "repeat",
                    backgroundSize: "contain",
                }}
            >
                {/* Card Principal */}
                <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10 max-w-xl w-full flex flex-col items-center gap-6 animate-fade-in">

                    {/* Loading State */}
                    {(loading || connecting) && !status && (
                        <div className="flex flex-col items-center gap-4 py-10">
                            <Image alt="load" width={95} height={95} src="/lod.gif" priority />
                            <p className="text-base text-gray-500 font-medium">
                                {connecting ? "Conectando..." : "Carregando informações..."}
                            </p>
                        </div>
                    )}

                    {/* Error State */}
                    {error && !loading && (
                        <div className="text-center py-5">
                            <p className="text-red-500 font-semibold text-base mb-5">{error}</p>
                            <button
                                onClick={fetchStatus}
                                className="bg-gradient-to-r from-wp to-wp-dark text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                            >
                                Tentar Novamente
                            </button>
                        </div>
                    )}

                    {/* Connected State */}
                    {!loading && !error && status?.status === "open" && (
                        <div className="flex flex-col items-center text-center gap-4 py-10 px-5">
                            <div className="w-20 h-20 bg-gradient-to-br from-wp to-wp-dark rounded-full flex items-center justify-center animate-scale-in relative">
                                <div className="absolute w-6 h-10 border-r-[5px] border-b-[5px] border-white rotate-45 top-3"></div>
                            </div>
                            <h1 className="text-3xl font-bold text-wp m-0">Número Conectado!</h1>
                            <p className="text-lg text-gray-500 font-normal m-0">
                                Seu número está pronto para receber mensagens.
                            </p>
                        </div>
                    )}

                    {/* QR Code / Pairing Code State */}
                    {!loading && !error && status?.status === "qr" && (
                        <>
                            {/* Header */}
                            <div className="text-center w-full">
                                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Conectar Número</h1>
                                <p className="text-base text-gray-500 font-normal">Escolha como deseja conectar</p>
                            </div>

                            {/* Mode Toggle */}
                            <div className="flex bg-gray-100 rounded-xl p-1 w-full max-w-sm">
                                <button
                                    onClick={() => {
                                        setConnectionMode("qr");
                                        setPairingCode(null);
                                        setError(null);
                                    }}
                                    className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-300 ${connectionMode === "qr"
                                            ? "bg-white text-wp shadow-md"
                                            : "text-gray-500 hover:text-gray-700"
                                        }`}
                                >
                                    📷 QR Code
                                </button>
                                <button
                                    onClick={() => {
                                        setConnectionMode("pairing");
                                        setError(null);
                                    }}
                                    className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-300 ${connectionMode === "pairing"
                                            ? "bg-white text-wp shadow-md"
                                            : "text-gray-500 hover:text-gray-700"
                                        }`}
                                >
                                    🔢 Código
                                </button>
                            </div>

                            {/* QR Code Mode */}
                            {connectionMode === "qr" && (
                                <>
                                    <div className="flex flex-col items-center gap-5 w-full">
                                        {status.qrcode ? (
                                            <div className="relative bg-gradient-to-br from-wp to-wp-dark p-5 rounded-2xl shadow-lg animate-pulse-slow">
                                                <img
                                                    alt="qrcode"
                                                    width={280}
                                                    height={280}
                                                    src={status.qrcode}
                                                    className="rounded-xl bg-white p-2.5 block"
                                                    style={{ imageRendering: "pixelated" }}
                                                />
                                                {connecting && (
                                                    <div className="absolute inset-0 bg-black/70 rounded-2xl flex items-center justify-center animate-fade-in">
                                                        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-4 py-10">
                                                <Image alt="load" width={95} height={95} src="/lod.gif" priority />
                                                <p className="text-base text-gray-500 font-medium">Gerando QR Code...</p>
                                            </div>
                                        )}

                                        <button
                                            onClick={requestConnect}
                                            disabled={connecting || isCooldownActive}
                                            className="bg-gradient-to-r from-wp to-wp-dark text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 w-full max-w-xs text-center disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                                        >
                                            {connecting
                                                ? "Atualizando..."
                                                : isCooldownActive
                                                    ? `Aguarde ${cooldownRemaining}s`
                                                    : "Recarregar QR Code"}
                                        </button>
                                    </div>

                                    {/* QR Instructions */}
                                    <div className="bg-gray-50 rounded-2xl p-6 w-full">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Como conectar:</h3>
                                        <div className="flex flex-col gap-3">
                                            {[
                                                "Abra o app no seu celular",
                                                "Toque em Mais opções → Aparelhos conectados",
                                                "Toque em Conectar um aparelho",
                                                "Escaneie o QR Code acima",
                                            ].map((step, index) => (
                                                <div key={index} className="flex items-start gap-3 text-base text-gray-600 leading-relaxed">
                                                    <span className="flex-shrink-0 w-6 h-6 bg-wp text-white text-xs font-bold rounded-full flex items-center justify-center">
                                                        {index + 1}
                                                    </span>
                                                    <span>{step}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Pairing Code Mode */}
                            {connectionMode === "pairing" && (
                                <>
                                    <div className="flex flex-col items-center gap-5 w-full">
                                        {/* Phone Input */}
                                        {!pairingCode && (
                                            <div className="w-full max-w-sm">
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Número do telefone
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                                        +
                                                    </span>
                                                    <input
                                                        type="tel"
                                                        value={phoneNumber}
                                                        onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ""))}
                                                        placeholder="5511999999999"
                                                        className="w-full pl-8 pr-4 py-4 border-2 border-gray-200 rounded-xl text-lg font-medium focus:border-wp focus:outline-none transition-colors"
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-400 mt-2">
                                                    Número internacional sem o + (ex: 5511999999999)
                                                </p>
                                            </div>
                                        )}

                                        {/* Pairing Code Display */}
                                        {pairingCode && (
                                            <div className="bg-gradient-to-br from-wp to-wp-dark p-6 rounded-2xl shadow-lg w-full max-w-sm text-center">
                                                <p className="text-white/80 text-sm font-medium mb-2">Código de Pareamento</p>
                                                <p className="text-white text-4xl font-bold tracking-widest font-mono">
                                                    {formatPairingCode(pairingCode)}
                                                </p>
                                                {pairingCodeExpiry && (
                                                    <p className="text-white/70 text-sm mt-3">
                                                        ⏱️ Expira em {pairingCodeExpiry}s
                                                    </p>
                                                )}
                                                {!pairingCodeExpiry && (
                                                    <p className="text-white/70 text-sm mt-3">
                                                        ⚠️ Código expirado
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {/* Generate Button */}
                                        <button
                                            onClick={generatePairingCode}
                                            disabled={generatingPairingCode || (!pairingCode && phoneNumber.replace(/\D/g, "").length < 10)}
                                            className="bg-gradient-to-r from-wp to-wp-dark text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 w-full max-w-xs text-center disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                                        >
                                            {generatingPairingCode ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                    Gerando...
                                                </span>
                                            ) : pairingCode ? (
                                                "Gerar Novo Código"
                                            ) : (
                                                "Gerar Código de Pareamento"
                                            )}
                                        </button>
                                    </div>

                                    {/* Pairing Instructions */}
                                    <div className="bg-gray-50 rounded-2xl p-6 w-full">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Como usar o código:</h3>
                                        <div className="flex flex-col gap-3">
                                            {[
                                                "Digite seu número de telefone acima",
                                                "Clique em \"Gerar Código de Pareamento\"",
                                                "No celular: Configurações → Aparelhos conectados",
                                                "Toque em \"Conectar um aparelho\"",
                                                "Escolha \"Vincular com número de telefone\"",
                                                "Digite o código de 8 dígitos",
                                            ].map((step, index) => (
                                                <div key={index} className="flex items-start gap-3 text-base text-gray-600 leading-relaxed">
                                                    <span className="flex-shrink-0 w-6 h-6 bg-wp text-white text-xs font-bold rounded-full flex items-center justify-center">
                                                        {index + 1}
                                                    </span>
                                                    <span>{step}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Vantagens */}
                                        <div className="mt-4 pt-4 border-t border-gray-200">
                                            <p className="text-sm font-semibold text-gray-700 mb-2">✨ Vantagens do código:</p>
                                            <ul className="text-sm text-gray-500 space-y-1">
                                                <li>• Não requer câmera</li>
                                                <li>• Ideal para dispositivos sem câmera</li>
                                                <li>• Mais fácil para alguns usuários</li>
                                            </ul>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* Closed/Disconnected State */}
                    {!loading && !error && status?.status === "close" && (
                        <>
                            <div className="flex flex-col items-center text-center gap-5 py-10 px-5">
                                <div className="w-20 h-20 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center text-4xl">
                                    📴
                                </div>
                                <h2 className="text-2xl font-bold text-gray-800 m-0">Instância Desconectada</h2>
                                <p className="text-base text-gray-500 font-normal m-0">
                                    Clique no botão abaixo para gerar um novo QR Code e conectar seu número.
                                </p>
                                <button
                                    onClick={requestConnect}
                                    disabled={connecting || isCooldownActive}
                                    className="mt-2.5 bg-gradient-to-r from-wp to-wp-dark text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                                >
                                    {connecting
                                        ? "Conectando..."
                                        : isCooldownActive
                                            ? `Aguarde ${cooldownRemaining}s`
                                            : "Conectar número"}
                                </button>
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-6 w-full">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">O que acontece ao clicar:</h3>
                                <div className="flex flex-col gap-3">
                                    {[
                                        "Um novo QR Code será gerado para sua instância",
                                        "Escaneie o código com seu app para conectar",
                                        "Pronto! Sua instância estará ativa em segundos",
                                    ].map((step, index) => (
                                        <div key={index} className="flex items-start gap-3 text-base text-gray-600 leading-relaxed">
                                            <span className="flex-shrink-0 w-6 h-6 bg-wp text-white text-xs font-bold rounded-full flex items-center justify-center">
                                                {index + 1}
                                            </span>
                                            <span>{step}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
};

export default ConnectInstance;

export function getServerSideProps(context: any) {
    const { params } = context;

    context.res.setHeader(
        "Cache-Control",
        "no-cache, no-store, must-revalidate"
    );
    context.res.setHeader("Pragma", "no-cache");
    context.res.setHeader("Expires", "0");

    return {
        props: {
            stack: params.stack,
            instanceName: params.name,
        },
    };
}
