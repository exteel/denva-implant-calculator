/**
 * Hosts the (client) calculator. The wrapper reserves the calculator's
 * first-screen height so hydration cannot shift the content below it (CLS < 0.1,
 * ТЗ §11.7). It is a plain <section> inside the page's <main>; the embedded calculator renders a <section>, not a <main>.
 */
export function CalculatorIsland({ children }: { children: React.ReactNode }) {
  return (
    <section id="calculator" aria-label="Калькулятор вартості імплантації" className="mt-8 min-h-[720px] border-y border-line bg-canvas">
      {children}
    </section>
  );
}
