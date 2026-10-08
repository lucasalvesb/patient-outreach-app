import { telHref } from "../lib/phone";

/** A patient's phone as a link that dials it (on a phone, or a softphone on a desktop). */
export function PhoneNumber({ phone }: { phone: string }) {
  if (!phone) return <span className="muted">Not on file</span>;
  return (
    <a className="phone-link" href={telHref(phone)}>
      {phone}
    </a>
  );
}
