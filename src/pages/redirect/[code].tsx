import { useEffect, useState } from "react";

import axios from "axios";
import Head from "next/head";
import Image from "next/image";
import ReactGA from "react-ga4";
import { useMutation } from "react-query";
import { toast } from "react-toastify";

import { getCookie } from "@/components/cookie";

interface IPorps {
  fbPixel?: string;
  gPixel?: string;
  gPixelConversion?: string;
  access_token?: string;
  code: string;
  isWpButtom?: any;
}
const RedirectWP = (data0: IPorps) => {
  console.log("DATA0: ", data0);
  const [error, setError] = useState<string | null>(null);
  const [showFallbackButton, setShowFallbackButton] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const { mutate } = useMutation(
    async ({ ip, state, city }: { ip?: any; state?: any; city?: any }) =>
      axios.post(
        `https://wp-api.datalitics.app/wp-api/redirect-wp-lead/${data0.code}${data0?.isWpButtom ? "?isWpButtom=true" : ""
        }`,
        {
          ...data0,
          ip: ip ?? null,
          state: state ?? null,
          city: city ?? null,
          fpb: getCookie("_fpb"),
        }
      ),
    {
      onSuccess: async ({ data }) => {
        // Deduplicate URL parameters to prevent 431 errors from duplicate UTMs
        const deduplicateUrlParams = (urlString: string): string => {
          try {
            const urlObj = new URL(urlString);
            const params = new URLSearchParams();
            const seenParams = new Map<string, string>();

            // Keep only the first occurrence of each parameter
            urlObj.searchParams.forEach((value, key) => {
              if (!seenParams.has(key)) {
                seenParams.set(key, value);
                params.set(key, value);
              }
            });

            urlObj.search = params.toString();
            return urlObj.toString();
          } catch (e) {
            // If URL parsing fails, return original
            return urlString;
          }
        };

        let url = data.url.replace(/\+/g, '%2B');
        url = deduplicateUrlParams(url);

        console.log("Deduplicated URL:", url);
        setRedirectUrl(url);

        // Try to redirect immediately
        try {
          // window.location.href is generally more reliable in some IABs
          // as it's treated more like a user-initiated navigation in some contexts
          window.location.href = url;
        } catch (e) {
          console.error("Redirect via location.href failed:", e);
          window.location.replace(url);
        }

        // Show fallback button after 3 seconds if redirect hasn't happened
        setTimeout(() => {
          setShowFallbackButton(true);
        }, 3000);
      },
      onError: (err: any) => {
        const errorMessage = err?.response?.status === 404
          ? "Link não encontrado. Por favor, verifique o código e tente novamente."
          : "Erro ao processar redirecionamento. Tente novamente mais tarde.";

        setError(errorMessage);
        toast(errorMessage, {
          position: "top-right",
          autoClose: 5000,
          type: "error",
        });
      },
    }
  );

  const load = async () => {
    try {
      console.log("load");

      if (!!data0?.fbPixel) {
        const { default: ReactPixel } = await import("react-facebook-pixel");
        ReactPixel.init(data0.fbPixel);
        ReactPixel.pageView();
        console.log("Facebook Pixel tracking completed");
      } else {
        console.log("No fbPixel data0 found");
      }

      if (!!data0?.gPixelConversion && !!data0?.gPixel) {
        ReactGA.initialize(`AW-${data0.gPixel}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        ReactGA.send({
          hitType: "pageview",
          page: window.location.pathname + window.location.search,
        });
        // Uncomment if needed
        ReactGA.event("conversion", {
          send_to: `AW-${data0.gPixel}/${data0.gPixelConversion}`,
        });
        console.log("Google Pixel tracking completed");
      } else {
        console.log("No gPixelConversion or gPixel data found");
      }

      console.log("loadM");

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 segundos

        const response = await fetch("https://ipapi.co/json/", {
          signal: controller.signal
        });

        clearTimeout(timeoutId); // Limpa o timeout se a requisição foi bem-sucedida

        if (response.ok) {
          const { ip, city, region } = await response.json();
          mutate({ ip, state: region, city });
        } else {
          mutate({});
        }
      } catch (error) {
        // Este catch vai pegar tanto erros de rede quanto timeout
        mutate({});
      }
    } catch (error) {
      console.error("Error during tracking setup:", error);
    }
  };

  useEffect(() => {
    if (typeof window != "undefined") {
      load();
    }
  }, [typeof window]);

  return (
    <>
      <Head>
        <title>CRM online</title>
        <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
      </Head>
      <div className="background-wp">
        <div style={{ minHeight: 300 }} className="box-wp">
          {error ? (
            <>
              <p className="title-wp" style={{ color: "#ff4444", fontWeight: "bold" }}>
                ⚠️ Erro
              </p>
              <p style={{ color: "#666", textAlign: "center", padding: "0 20px" }}>
                {error}
              </p>
            </>
          ) : (
            <>
              <p className="title-wp">Estamos te redirecionando para o contato</p>
              <Image alt="load" width={95} height={95} src="/lod.gif" />
              {showFallbackButton && redirectUrl && (
                <div style={{ marginTop: "20px", width: "100%", display: "flex", justifyContent: "center" }}>
                  <a
                    href={redirectUrl}
                    style={{
                      backgroundColor: "#25D366",
                      color: "white",
                      padding: "12px 24px",
                      borderRadius: "8px",
                      textDecoration: "none",
                      fontWeight: "bold",
                      fontSize: "16px",
                      boxShadow: "0 4px 12px rgba(37, 211, 102, 0.3)",
                      transition: "transform 0.2s ease"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    Ir para o contato agora
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};
export default RedirectWP;

export const getPa = (data: any) => {
  const fields = [
    "utm_campaign",
    "utm_source",
    "utm_medium",
    "utm_term",
    "matchtype",
    "device",
    "network",
    "loc",
    "placement",
    "gclid",
    "gad_source",
  ];

  fields.forEach((field) => {
    if (data[field]) {
      if (Array.isArray(data[field])) {
        data[field] = data[field][0];
      } else if (typeof data[field] !== "string") {
        data[field] = String(data[field]);
      }
    }
  });

  return data;
};
export async function getServerSideProps(context: any) {
  const { params, query } = context;

  try {
    const props = await getPixel(params.code);
    return {
      props: { ...params, ...getPa(query), ...props },
    };
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return {
        notFound: true,
      };
    }
    // For other errors, return minimal props so the page can still render
    return {
      props: { ...params, ...getPa(query) },
    };
  }
}

const getPixel = async (code: string, retries = 3): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(
        `https://wp-api.datalitics.app/wp-api/redirect-wp-lead-info/${code}`,
        { timeout: 5000 }
      );
      return response.data;
    } catch (error: any) {
      // If it's a definitive 404, don't retry
      if (error?.response?.status === 404) throw error;
      // Transient error — retry after short backoff
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, 200 * (i + 1)));
      } else {
        throw error;
      }
    }
  }
};
