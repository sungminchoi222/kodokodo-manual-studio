// 공용 폼 요소. 모바일 터치 영역(최소 44px)과 16px 글자(iOS 확대 방지)를 기본으로 한다.
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const control =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base disabled:bg-stone-100 aria-[invalid=true]:border-red-500";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

export function TextInput({ invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} aria-invalid={invalid || undefined} className={`${control} ${props.className ?? ""}`} />;
}

export function TextArea({ invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea rows={3} {...props} aria-invalid={invalid || undefined} className={`${control} ${props.className ?? ""}`} />;
}

export function Select({ invalid, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select {...props} aria-invalid={invalid || undefined} className={`${control} ${props.className ?? ""}`} />;
}

export function Button({
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-brand text-white",
    secondary: "border border-stone-300 bg-white text-stone-900",
    danger: "border border-red-300 bg-white text-red-700",
    ghost: "text-stone-700 underline-offset-2 hover:underline",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    />
  );
}

export function FormMessage({ result }: { result: { ok: boolean; error?: string } | null }) {
  if (!result) return null;
  if (result.ok) return <p className="text-sm text-emerald-700">Saved.</p>;
  return <p className="text-sm text-red-700">{result.error}</p>;
}

/** 빈칸은 null, 숫자가 아니면 NaN (서버 검증에서 걸러짐). 기본값을 채우지 않는다. */
export function parseNum(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const textOrNull = (v: string) => (v.trim() === "" ? null : v.trim());
