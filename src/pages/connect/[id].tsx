import { useState, useEffect } from "react";

import axios from "axios";
import Head from "next/head";
import Image from "next/image";
import { useQuery } from "react-query";

const EVO_MANAGER_API = process.env.EVO_MANAGER_API;

const Connect = (props: any) => {
  const instanceId = props?.params?.id;

  // Estados locais para dados
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Estados para contador e reload
  const [countdown, setCountdown] = useState<number>(20);
  const [showReloadButton, setShowReloadButton] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // Requisição HTTP inicial
  const { data, isLoading, isRefetching, isError, refetch } = useQuery<{
    data: {
      key: string;
      phoneWithDialCode: string;
      name: string;
      connected: boolean;
      error: boolean;
      base64?: string;
      pairingCode?: string;
      code?: string;
      count?: number;
    };
  }>(
    [`wp-api-wp-one-refresh-${instanceId}`],
    async () => {
      return await axios.get(
        `${EVO_MANAGER_API}/instances/public/connect/${instanceId}/public`,
        {}
      );
    },
    {
      onSuccess: ({ data }) => {
        console.log("[HTTP] Dados iniciais recebidos:", data);

        // Atualizar estados com dados iniciais
        if (data?.base64) {
          setQrCode(data.base64);
        }
        if (data?.pairingCode) {
          setPairingCode(data.pairingCode);
        }
        if (data?.connected) {
          setIsConnected(true);
        }
      },
      enabled: true,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    }
  );

  // Contador de 20 segundos após carregar o QR code
  useEffect(() => {
    if (!qrCode || isConnected || isReloading || isRefetching) {
      return;
    }

    // Resetar contador e botão quando um novo QR code é carregado
    setCountdown(20);
    setShowReloadButton(false);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setShowReloadButton(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [qrCode, isConnected, isReloading, isRefetching]);

  function formatPairingCode(code: string): string {
    return code
      .split("")
      .map((char, index) => {
        return char + (index === 3 ? " - " : " ");
      })
      .join("");
  }

  const handleRefresh = async () => {
    console.log("[Refresh] Recarregando QR Code");
    setIsReloading(true);
    setShowReloadButton(false);

    try {
      await refetch();
    } finally {
      setIsReloading(false);
    }
  };

  if (isError) {
    return (
      <>
        <Head>
          <title>Contato | Erro</title>
          <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
        </Head>
        <div className="background-wp">
          <div
            style={{ minHeight: 300, borderRadius: 20, padding: 10 }}
            className="box-wp"
          >
            <p style={{ color: "red", fontWeight: "bold" }}>
              Erro ao carregar dados da número
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Contato | Conectando</title>
        <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <style jsx>{`
        .modern-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background-color: #e5e5e5;
          background-image: url("/wp.png");
          background-repeat: repeat;
          background-size: contain;
        }

        .modern-card {
          background: white;
          border-radius: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          padding: 40px;
          max-width: 600px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          animation: fadeIn 0.5s ease-in;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modern-header {
          text-align: center;
          width: 100%;
        }

        .modern-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #1f1f1f;
          margin: 0 0 8px 0;
        }

        .modern-header p {
          font-size: 16px;
          color: #666;
          margin: 0;
          font-weight: 400;
        }

        .qr-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          width: 100%;
        }

        .qr-wrapper {
          background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
          padding: 20px;
          border-radius: 20px;
          box-shadow: 0 4px 20px rgba(37, 211, 102, 0.3);
          animation: pulse 2s ease-in-out infinite;
          position: relative;
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
          }
        }

        .qr-code {
          border-radius: 12px;
          background: white;
          padding: 10px;
          display: block;
        }

        .pairing-code-box {
          background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
          padding: 20px 30px;
          border-radius: 16px;
          text-align: center;
          width: 100%;
          max-width: 350px;
          box-shadow: 0 4px 20px rgba(37, 211, 102, 0.3);
        }

        .pairing-code-label {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
          margin: 0 0 8px 0;
          font-weight: 500;
        }

        .pairing-code {
          font-size: 32px;
          font-weight: 700;
          color: white;
          letter-spacing: 4px;
          margin: 0;
          font-family: "Courier New", monospace;
        }

        .instructions {
          background: #f8f9fa;
          border-radius: 16px;
          padding: 24px;
          width: 100%;
        }

        .instructions h3 {
          font-size: 18px;
          font-weight: 600;
          color: #1f1f1f;
          margin: 0 0 16px 0;
        }

        .instruction-step {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 15px;
          color: #444;
          line-height: 1.6;
        }

        .step-number {
          background: #25d366;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .success-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 16px;
          padding: 40px 20px;
        }

        .success-icon {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          animation: scaleIn 0.5s ease-out;
          position: relative;
        }

        .success-icon::after {
          content: "";
          position: absolute;
          width: 24px;
          height: 40px;
          border: solid white;
          border-width: 0 5px 5px 0;
          transform: rotate(45deg);
          top: 12px;
        }

        @keyframes scaleIn {
          from {
            transform: scale(0);
          }
          to {
            transform: scale(1);
          }
        }

        .success-title {
          font-size: 32px;
          font-weight: 700;
          color: #25d366;
          margin: 0;
        }

        .success-subtitle {
          font-size: 18px;
          color: #666;
          margin: 0;
          font-weight: 400;
        }

        .countdown-badge {
          background: rgba(37, 211, 102, 0.95);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .reload-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.3s ease-in;
        }

        .reload-overlay-button {
          background: white;
          color: #25d366;
          border: none;
          border-radius: 50%;
          width: 80px;
          height: 80px;
          font-size: 32px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .reload-overlay-button:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 30px rgba(0, 0, 0, 0.4);
        }

        .reload-overlay-button:active {
          transform: scale(0.95);
        }

        .loading-spinner {
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top: 4px solid white;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .refresh-button {
          background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
          color: white;
          border: none;
          border-radius: 12px;
          padding: 14px 28px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3);
          width: 100%;
          max-width: 300px;
          text-align: center;
        }

        .refresh-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4);
        }

        .refresh-button:active {
          transform: translateY(0);
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 40px;
        }

        .loading-text {
          font-size: 16px;
          color: #666;
          font-weight: 500;
        }

        @media (max-width: 640px) {
          .modern-card {
            padding: 24px;
            gap: 20px;
          }

          .modern-header h1 {
            font-size: 24px;
          }

          .qr-wrapper {
            padding: 16px;
          }

          .pairing-code {
            font-size: 28px;
            letter-spacing: 3px;
          }

          .instructions {
            padding: 20px;
          }

          .success-title {
            font-size: 28px;
          }
        }
      `}</style>

      <div className="modern-container">
        <div className="modern-card">
          {(isLoading || isRefetching) && (
            <div className="loading-container">
              <Image alt="load" width={95} height={95} src="/lod.gif" />
              <p className="loading-text">
                {isRefetching ? "Atualizando QR Code..." : "Carregando informações..."}
              </p>
            </div>
          )}

          {!isLoading && !isRefetching && isConnected && (
            <div className="success-section">
              <div className="success-icon"></div>
              <h1 className="success-title">Número Conectado!</h1>
              <p className="success-subtitle">
                Seu número está ativa e pronta para uso.
              </p>
            </div>
          )}

          {!isLoading && !isRefetching && !isConnected && (
            <>
              <div className="modern-header">
                <h1>Conectar Número</h1>
                <p>Escaneie o QR Code para conectar ao seu número</p>
              </div>

              <div className="qr-section">
                {qrCode && (
                  <>
                    <div className="qr-wrapper">
                      <Image
                        alt="qrcode"
                        width={280}
                        height={280}
                        src={qrCode}
                        className="qr-code"
                      />
                      {isReloading && (
                        <div className="reload-overlay">
                          <div className="loading-spinner"></div>
                        </div>
                      )}
                      {showReloadButton && !isReloading && (
                        <div className="reload-overlay">
                          <button
                            onClick={handleRefresh}
                            className="reload-overlay-button"
                            title="Gerar novo QR Code"
                          >
                            🔄
                          </button>
                        </div>
                      )}
                    </div>
                    {countdown > 0 && !showReloadButton && !isReloading && (
                      <div className="countdown-badge">
                        ⏱️ Novo QR em {countdown}s
                      </div>
                    )}
                  </>
                )}

                {pairingCode && (
                  <div className="pairing-code-box">
                    <p className="pairing-code-label">Código de Pareamento</p>
                    <p className="pairing-code">
                      {formatPairingCode(pairingCode)}
                    </p>
                  </div>
                )}
              </div>

              <div className="instructions">
                <h3>Como conectar:</h3>
                <div className="instruction-step">
                  <span className="step-number">1</span>
                  <span>Abra o App no seu celular</span>
                </div>
                <div className="instruction-step">
                  <span className="step-number">2</span>
                  <span>Toque em Mais opções → Aparelhos conectados</span>
                </div>
                <div className="instruction-step">
                  <span className="step-number">3</span>
                  <span>Toque em Conectar um aparelho</span>
                </div>
                <div className="instruction-step">
                  <span className="step-number">4</span>
                  <span>
                    {pairingCode
                      ? "Digite o código de pareamento ou escaneie o QR Code"
                      : "Escaneie o QR Code acima"}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};
export default Connect;

export async function getServerSideProps(context: any) {
  const { params, query } = context;

  return {
    props: {
      params,
      query,
    },
  };
}
