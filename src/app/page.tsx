import { RedirectNotice } from "@/components/seo/RedirectNotice";
import { redirectMetadata } from "@/lib/seo/metadata";

/** The calculator moved to /implant-calculator/ (ТЗ §11.1); a static host cannot redirect, so: canonical + meta refresh + link. */
export const metadata = redirectMetadata();

export default function HomePage() {
  return <RedirectNotice />;
}
