import { useEffect, useState } from "react";

import axios from "axios";
import { setCookie } from "cookies-next";
import { parsePhoneNumber } from "libphonenumber-js";
import Head from "next/head";
import Image from "next/image";
import { Router } from "next/router";
import ReactGA from "react-ga4";
import { useMutation, useQuery } from "react-query";
import { toast } from "react-toastify";

import { COUNTRIES, removeDialCode } from "@/common/countries";
import { getCookie } from "@/components/cookie";
import { InputPhone } from "@/components/phone-input";

import { getPa } from "./redirect/[code]";

const URL = process.env.API_URL ?? "https://api.datalitics.com.br";
const WP = ({ params, codeCookie, query, isRegistred }: any) => {
  const { code } = params;
  const [registred, setRegistred] = useState(isRegistred);
  const [country, setCountry] = useState("BR");
  const [phone, setPhone] = useState("+55");
  const [load, setLoad] = useState(false);
  const [form, setForm] = useState({
    name: "",
  });

  const { data: dataLinkUrl } = useQuery<{
    data: {
      url: string;
      clientId: string;
      wpLinkId: string;
      access_token?: string;
      fbPixel?: string;
      gPixel?: string;
      gPixelConversion?: string;
    };
  }>(
    code,
    async () => await axios.get(`https://wp-api.datalitics.app/wp-link/logo-client-wp-link/${code}`)
  );

  const {
    mutate,
    isLoading,
    isError,
    data: dataUrl,
  } = useMutation(
    async () =>
      await axios.post(`https://wp-api.datalitics.app/wp-link/click/${code}`, {
        notSave: code == codeCookie,
        ...query,
      }),
    {
      onSuccess: ({ data }) => {
        setLoad(true);
        if (isRegistred) {
          window.location.replace(data.url);
        }
        //default Country
        if (!!data?.defaultDialCode) {
          setPhone(data.defaultDialCode);
          setCountry(
            COUNTRIES.find((e) => e.dial_code == data.defaultDialCode)?.code ??
            "+55"
          );
        }

        if (!!data?.fbPixel) {
          import("react-facebook-pixel")
            .then((x) => x.default)
            .then((ReactPixel) => {
              ReactPixel.init(data.fbPixel as string);
              ReactPixel.pageView();
              console.log("page view");
              Router.events.on("routeChangeComplete", () => {
                ReactPixel.pageView();
              });
            });
        }
        if (!!data?.gPixel) {
          ReactGA.initialize("AW-" + data?.gPixel);
          ReactGA.send({
            hitType: "pageview",
            page: window.location.pathname + window.location.search,
          });
        }
      },
      onError: (data: any) => {
        const msm = data.response.data.message;
        if (typeof msm == "string") {
          toast(msm, {
            position: "top-right",
            autoClose: 5000,
            type: "error",
          });
        } else {
          for (const iterator of msm as string[]) {
            toast(iterator, {
              position: "top-right",
              autoClose: 5000,
              type: "error",
            });
          }
        }
      },
    }
  );

  useEffect(() => {
    setCookie("codeCookie", code, {
      path: "/",
      expires: new Date(new Date().getTime() + 60 * 24 * 60 * 365 * 1000),
    });

    if (!isLoading && !load) {
      mutate();
    }
  }, []);

  const [ip, setIp] = useState<any>(undefined);
  const [estado, setEstado] = useState<any>(undefined);
  const [cidade, setCidade] = useState<any>(undefined);
  useEffect(() => {
    if (typeof window != "undefined") {
      fetch("https://ipapi.co/json/")
        .then((response) => response.json())
        .then((data) => {
          setIp(data?.ip ?? undefined);
          setCidade(data?.city ?? undefined);
          setEstado(data?.region ?? undefined);
        })
        .catch((error) => console.error("Erro:", error));
    }
  }, [typeof window]);

  const {
    mutate: createLead,
    isLoading: isLoadingLead,
    isError: isErrorLead,
  } = useMutation(
    async () =>
      await axios.post(`${URL}/lead`, {
        ...getPa(query),
        ...form,
        phone: removeDialCode(phone.replace(/[^0-9+]/g, "")).number,
        dialCode: removeDialCode(phone.replace(/[^0-9+]/g, "")).dialCode,
        phoneWithDialCode: phone.replace(/[^0-9+]/g, ""),
        clientId: dataUrl?.data.clientId,
        wpLinkId: dataUrl?.data.wpLinkId,
        ip: ip,
        city: cidade,
        state: estado,
        userClientId: dataUrl?.data?.userClientId,
        typeOrigin: "wp",
        eventSourceUrl:
          (typeof query?.event_source_url === "string" && query.event_source_url) ||
          (typeof query?.eventSourceUrl === "string" && query.eventSourceUrl) ||
          `https://wp.faleconosco.chat/${code}`,
        current_timestamp: new Date(),
        fpb: getCookie("_fpb"),
      }),
    {
      onSuccess: async ({ }) => {
        setRegistred(true);
        setCookie("isRegistred", code, {
          path: "/",
          expires: new Date(new Date().getTime() + 60 * 24 * 60 * 365 * 1000),
        });

        if (!!dataUrl?.data?.fbPixel && !dataUrl?.data?.access_token) {
          const { default: ReactPixel } = await import("react-facebook-pixel");
          ReactPixel.init(dataUrl.data.fbPixel as string);
          ReactPixel.track("Lead", {
            phone: phone.replace(/[^0-9+]/g, ""),
          });
        }

        if (!!dataUrl?.data?.gPixelConversion && !!dataUrl?.data?.gPixel) {
          ReactGA.initialize("AW-" + dataUrl?.data?.gPixel);
          ReactGA.event("conversion", {
            send_to: `AW-${dataUrl?.data?.gPixel}/${dataUrl?.data?.gPixelConversion}`,
          });
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        window.location.replace(dataUrl?.data.url);
      },
      onError: (data: any) => {
        const msm = data.response.data.message;
        if (typeof msm == "string") {
          toast(msm, {
            position: "top-right",
            autoClose: 5000,
            type: "error",
          });
        } else {
          for (const iterator of msm as string[]) {
            toast(iterator, {
              position: "top-right",
              autoClose: 5000,
              type: "error",
            });
          }
        }
      },
    }
  );

  const onSubmit = () => {
    if (form.name.length == 0) {
      return toast("Insira seu nome", {
        position: "top-right",
        autoClose: 3000,
        type: "error",
      });
    }

    const phoneNumber = parsePhoneNumber(phone);
    if (!phone || !phoneNumber?.isValid()) {
      return toast("Preencha seu telefone corretamente", {
        position: "top-right",
        autoClose: 5000,
        type: "error",
      });
    }
    createLead();
  };

  const render = () => {
    if (isLoadingLead || isRegistred || registred) {
      return (
        <>
          <p className="title-wp">Estamos te redirecionando para o contato</p>
          <Image alt="load" width={95} height={95} src="/lod.gif" />
        </>
      );
    }

    if (!isRegistred) {
      return (
        <>
          {!!dataLinkUrl?.data && dataLinkUrl?.data?.url.length > 0 && (
            <img
              height={100}
              alt={code}
              style={{ maxWidth: "70%" }}
              id={code}
              src={dataLinkUrl?.data.url as string}
            />
          )}
          <span className="title">
            Estamos conectando você ao nosso Número.
            <br />
            <b>Antes disso, nos informe o seu nome e telefone.</b>
          </span>
          <div className="row-input">
            <label htmlFor="name">Nome</label>
            <input
              disabled={isError || isLoading}
              id="name"
              placeholder="Ex: Ana Maria"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="input"
            />
          </div>
          <InputPhone
            phone={phone}
            disabled={isLoadingLead}
            setPhone={setPhone}
            country={country}
            setCountry={setCountry}
          />
          <input
            type="submit"
            onClick={() => onSubmit()}
            disabled={isError || isLoading}
            value={"Fale agora"}
            className="submit"
          />
        </>
      );
    }
  };

  return (
    <>
      <Head>
        <title>Contato Manual</title>
        <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
      </Head>
      <div className="background-wp">
        <div
          style={{
            minHeight:
              !!dataLinkUrl?.data &&
                dataLinkUrl?.data.url.length > 0 &&
                !isRegistred &&
                !registred
                ? 500
                : 400,
          }}
          className="box-wp"
        >
          {render()}
        </div>
      </div>
    </>
  );
};

export default WP;

export function getServerSideProps(context: any) {
  const codeCookie = context.req.cookies["codeCookie"] ?? null;
  const isRegistred = context.req.cookies["isRegistred"] ?? null;
  return {
    props: {
      params: context.params,
      isRegistred: isRegistred == context.params.code,
      codeCookie: codeCookie,
      query: { ...context.query },
    },
  };
}
