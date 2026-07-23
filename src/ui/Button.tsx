import type { ButtonHTMLAttributes } from "react";
type Variant = "primary" | "default" | "ghost" | "danger";
export function Button({ variant = "default", className = "", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const v = variant === "default" ? "" : variant;
  return <button className={`btn ${v} ${className}`.trim()} {...rest} />;
}
