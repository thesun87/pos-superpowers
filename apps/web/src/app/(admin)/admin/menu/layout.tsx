import type { ReactNode } from "react";

export default function MenuSectionLayout({ children }: { children: ReactNode }) {
  return <section className="space-y-4">{children}</section>;
}
