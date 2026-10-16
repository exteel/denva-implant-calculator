import { RedirectNotice } from "@/components/seo/RedirectNotice";
import { redirectMetadata } from "@/lib/seo/metadata";

/** Legacy URL of the calculator: canonical to /implant-calculator/ + meta refresh + link. */
export const metadata = redirectMetadata();

export default function CalculatorPage() {
  return <RedirectNotice />;
}
