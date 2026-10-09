import { Logo } from "@/components/ui/Logo";
import { StartButton } from "@/components/StartButton";

const ANSWERS = [
  { title: "Скільки це приблизно коштує", text: "Ринковий діапазон у вашому місті або регіоні — від нижньої до верхньої межі, з типовою ціною." },
  { title: "Що входить у ціну", text: "Повний кошик лікування: імплант, компоненти, сканування та постійна коронка або конструкція." },
  { title: "Що може оплачуватися окремо", text: "Видалення, кісткова пластика, синус-ліфтинг, седація — окремо й лише якщо їх підтвердить лікар." },
  { title: "Чим відрізняються сегменти", text: "Базовий, Оптимальний і Преміальний — це різні системи імплантів і матеріали, а не «погано» чи «добре»." },
  { title: "Що робити далі", text: "Один зрозумілий наступний крок: перевірити план, розібрати КТ, отримати консультацію чи пропозиції клінік." },
];

const STEPS = [
  { n: "1", title: "Місто", text: "Ціни на імплантацію помітно відрізняються між містами та регіонами." },
  { n: "2", title: "Ваша ситуація", text: "Кілька простих запитань без медичних термінів — зазвичай 3–5." },
  { n: "3", title: "Результат", text: "Діапазон вартості, склад лікування та можливі доплати — одразу на екрані." },
];

const FAQ = [
  {
    q: "Чи потрібно залишати телефон, щоб побачити ціну?",
    a: "Ні. Основний розрахунок показується одразу, без реєстрації та номера телефону.",
  },
  {
    q: "Чому діапазон, а не одна ціна?",
    a: "Вартість залежить від клініки, системи імплантів, матеріалу коронки та вашої клінічної ситуації. Ми показуємо, скільки зазвичай коштує співставне лікування на ринку.",
  },
  {
    q: "Чи замінює калькулятор консультацію лікаря?",
    a: "Ні. Калькулятор не ставить діагноз і не призначає лікування. Він допомагає зорієнтуватися у вартості й підготуватися до розмови з лікарем.",
  },
  {
    q: "Мені вже назвали ціну. Чи можна її перевірити?",
    a: "Так. Після розрахунку введіть суму та що в неї входить — ми порівняємо її з ринковим діапазоном для співставного лікування.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <span className="hidden text-sm font-semibold text-muted sm:inline">
          Фінансовий навігатор імплантації
        </span>
      </header>

      <main>
        <section className="bg-canvas">
          <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 sm:py-20 md:grid-cols-[1.25fr_1fr] md:items-center">
            <div>
              <p className="mb-4 inline-flex rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand">
                Безкоштовно · без телефону · 2 хвилини
              </p>
              <h1 className="text-[34px] leading-[1.1] font-extrabold tracking-tight text-balance sm:text-[48px]">
                Скільки коштує імплантація зубів у вашому місті?
              </h1>
              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-soft">
                Калькулятор Denva показує орієнтовний ринковий діапазон вартості повного лікування —
                а не рекламну ціну «імплант від…». Ви побачите, що входить у ціну, що може
                оплачуватися окремо, і що робити далі.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <StartButton placement="hero" />
                <span className="text-sm text-muted">Результат одразу, без реєстрації</span>
              </div>
            </div>

            <div
              aria-hidden
              className="rounded-[var(--radius-card)] border border-line bg-paper p-5 shadow-[0_20px_50px_-30px_rgba(16,24,40,0.35)]"
            >
              <p className="text-xs font-bold tracking-wide text-muted uppercase">Приклад результату · демо-дані</p>
              <p className="mt-1 text-[15px] font-extrabold">Один зуб · Львів</p>
              <div className="mt-4 space-y-2.5">
                {[
                  ["Базовий", "22 000–30 600 грн", "w-[40%]"],
                  ["Оптимальний", "31 300–43 400 грн", "w-[58%]"],
                  ["Преміальний", "46 500–64 600 грн", "w-[86%]"],
                ].map(([label, range, width]) => (
                  <div key={label} className="rounded-xl border border-line p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-bold">{label}</span>
                      <span className="tabular text-sm font-extrabold">{range}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-canvas">
                      <div className={`h-1.5 rounded-full bg-brand ${width}`} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Імплант, компоненти, сканування і постійна коронка — у сумі. Видалення та кісткова
                пластика — окремо, лише за потреби.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">
            П’ять відповідей за один розрахунок
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ANSWERS.map((item, index) => (
              <li key={item.title} className="rounded-[var(--radius-card)] border border-line p-5">
                <span className="tabular text-sm font-extrabold text-brand">0{index + 1}</span>
                <h3 className="mt-2 text-[17px] font-extrabold">{item.title}?</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-canvas">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">Як це працює</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.n} className="rounded-[var(--radius-card)] bg-paper p-5">
                  <span className="grid size-9 place-items-center rounded-full bg-brand text-[15px] font-extrabold text-white">
                    {step.n}
                  </span>
                  <h3 className="mt-4 text-[17px] font-extrabold">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{step.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8">
              <StartButton placement="how_it_works" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <h2 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">Часті запитання</h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-bold">
                  {item.q}
                  <span aria-hidden className="text-xl text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto max-w-5xl px-4 py-8 text-sm leading-relaxed text-muted sm:px-6">
          <Logo />
          <p className="mt-4 max-w-3xl">
            Калькулятор показує орієнтовні ринкові діапазони і не є медичною консультацією, діагнозом
            чи планом лікування. Остаточний обсяг і вартість лікування визначає лікар після огляду
            та діагностики.
          </p>
        </div>
      </footer>
    </div>
  );
}
