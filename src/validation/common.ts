import { z } from "zod";

/** 빈 문자열은 null 로 정규화한 선택 텍스트 */
export const nullableText = (max = 2000) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable(),
  );

export const requiredText = (min: number, max: number) => z.string().trim().min(min).max(max);

/** 양수 decimal, 미입력(null) 허용. 기본값/추정값을 넣지 않기 위해 0 이나 기본 수치로 대체하지 않는다. */
export const nullablePositive = () => z.number().finite().positive().nullable();

/** numeric(5,2) 범위의 온도 */
export const nullableTemperatureC = () => z.number().finite().gt(-1000).lt(1000).nullable();

export const uuid = () => z.uuid();
