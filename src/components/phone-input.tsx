import { useEffect } from 'react';

import parsePhoneNumber from 'libphonenumber-js';

import { removeDialCode } from '@/common/countries';

function InputPhone(props: any) {
  // useEffect(() => {
  //   if (typeof window !== undefined) {
  //     let ct0 = String(navigator.language).toUpperCase();
  //     let ct = ct0.search("-") > 0 ? ct0.split("-")[1] : ct0;
  //     if (hasFlag(ct)) {
  //       const dis = COUNTRIES.find((e) => e.code == ct)?.dial_code;
  //       if (!!dis) {
  //         props.setCountry(ct);
  //         props.setPhone(dis + " ");
  //       }
  //     }
  //   }
  // }, [typeof window]);

  useEffect(() => {
    const { code } = removeDialCode(props.phone);
    if (code !== "unknown") {
      props.setCountry(code);
    }

    const phoneNumber = parsePhoneNumber(props.phone);
    if (phoneNumber) {
      props.setPhone(phoneNumber.formatInternational());
    }
  }, [props.phone]);

  return (
    <div className="row-input">
      <label>Telefone</label>

      <div
        id="phone-country"
        style={{
          flexDirection: "row",
          alignItems: "center",
        }}
        className="input"
      >
        <div
          style={{ width: 29, height: 18 }}
          className={`flag:${props.country}`}
        />
        <input
          disabled={props?.disabled ?? false}
          value={props.phone}
          onChange={(e) => {
            if (e.target.value.length >= 1) {
              props.setPhone("+" + e.target.value.replace(/[^\d\s]/g, ""));
            }
          }}
          type="tel"
          autoComplete="off"
          id="abc-not"
          name="abc-off"
          placeholder='Ex: +55 (11) 99999-9999'
          className="input-empty"
        />
      </div>
    </div>
  );
}

export { InputPhone };
