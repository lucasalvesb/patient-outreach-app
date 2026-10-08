/** A tel: link for a number as the clinic wrote it: just its digits, and the + if it has one. */
export function telHref(phone: string): string {
  const plus = phone.trim().startsWith("+") ? "+" : "";
  return `tel:${plus}${phone.replace(/\D/g, "")}`;
}
