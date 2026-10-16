import Link from "next/link";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { Container, Section, SeoFooter, SeoHeader } from "@/components/seo/SeoChrome";
import { methodologyJsonLd } from "@/lib/seo/jsonld";
import { METHODOLOGY_DESCRIPTION, METHODOLOGY_TITLE, methodologyMetadata } from "@/lib/seo/metadata";
import { CATALOG_PATH, METHODOLOGY_UPDATED_AT } from "@/lib/seo/site";
import { formatDateUk } from "@/lib/seo/text";

export const metadata = methodologyMetadata();

function Formula({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-canvas px-4 py-3 font-mono text-[14px] leading-relaxed text-ink">{children}</p>;
}

export default function MethodologyPage() {
  return (
    <>
      <JsonLd data={methodologyJsonLd({ title: METHODOLOGY_TITLE, description: METHODOLOGY_DESCRIPTION, dateModified: METHODOLOGY_UPDATED_AT })} />
      <SeoHeader />
      <main>
        <Container className="pt-5 pb-16">
          <Breadcrumbs trail={[{ name: "Методологія" }]} />
          <h1 className="mt-5 text-3xl leading-tight font-extrabold text-ink sm:text-4xl">{METHODOLOGY_TITLE}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            Тут пояснено, з чого складається орієнтовна сума в калькуляторі DENVA, звідки беруться ціни й чого калькулятор не вміє. Сторінку
            востаннє змінено {formatDateUk(METHODOLOGY_UPDATED_AT)}.
          </p>

          <Section id="scope" title="Що це за калькулятор">
            <p>
              DENVA показує орієнтовний ринковий бюджет імплантації у вибраному місті. Це незалежний сервіс, а не калькулятор окремої клініки: він
              не рекламує конкретні клініки, не ставить діагноз і не визначає остаточну схему лікування.
            </p>
            <p>
              Верхня й нижня щелепи рахуються окремо, а загальна сума — це проста сума двох щелеп без прихованих знижок чи коригувань. Для
              кожного сценарію є три ринкові рівні: мінімальний, класичний і преміальний. Рівень імпланта та рівень коронки (або постійної
              конструкції) обираються незалежно.
            </p>
          </Section>

          <Section id="formulas" title="Формули розрахунку">
            <p>Усі формули посилаються лише на стандартизовані послуги й рівні. Проміжні значення не округлюються: округлення — лише під час показу.</p>

            <h3 className="pt-2 font-bold text-ink">Один зуб</h3>
            <Formula>імплант + формувач ясен + сканування щелепи + супраструктура + коронка</Formula>

            <h3 className="pt-2 font-bold text-ink">Від 2 до 6 зубів</h3>
            <p>Якщо зуби розташовані поруч, кількість імплантів менша за кількість зубів:</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b border-line-strong text-sm text-muted">
                    <th scope="col" className="py-2 pr-3 font-bold">Зубів поруч</th>
                    <th scope="col" className="px-2 py-2 font-bold">Імплантів</th>
                    <th scope="col" className="px-2 py-2 font-bold">Коронкових одиниць</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:px-2 [&_td]:py-2 [&_th]:py-2 [&_th]:pr-3 [&_tr]:border-b [&_tr]:border-line">
                  {[
                    [2, 2, 2],
                    [3, 2, 3],
                    [4, 2, 4],
                    [5, 3, 5],
                    [6, 3, 6],
                  ].map(([teeth, implants, units]) => (
                    <tr key={teeth}>
                      <th scope="row" className="font-bold text-ink">{teeth}</th>
                      <td>{implants}</td>
                      <td>{units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Formula>N імплантів × (імплант + формувач + супраструктура) + сканування щелепи + K коронок</Formula>
            <p>
              Якщо зуби розташовані в різних місцях, орієнтовно рахується N імплантів і N коронок. Якщо розташування невідоме, показується
              діапазон від варіанта «поруч» до варіанта «окремо», без медичного висновку.
            </p>
            <p>
              Якщо імпланти вже встановлені, імплант і формувач не додаються. Окремо враховується сканування, супраструктури за кількістю
              встановлених імплантів і коронки за кількістю зубів; якщо кількість імплантів невідома, показується діапазон допустимих схем.
            </p>

            <h3 className="pt-2 font-bold text-ink">Від 7 до 14 зубів: мости чи All-on</h3>
            <p>Для однієї щелепи порівнюються чотири сценарії. Жоден із них не позначається як медично рекомендований.</p>
            <Formula>Мости = 4 × (імплант + формувач + супраструктура) + сканування + кількість зубів × коронка</Formula>
            <Formula>All-on-N, перший етап = N × імплант + N × мультиюніт + тимчасова конструкція + сканування (N = 4, 6 або 8)</Formula>
            <Formula>All-on-N, повна вартість = перший етап + постійна конструкція + повторне сканування</Formula>
            <p>У картці All-on-N головна цифра — перший етап із тимчасовими зубами; повний бюджет показується окремо.</p>

            <h3 className="pt-2 font-bold text-ink">Тимчасове протезування</h3>
            <p>
              Воно не входить у суму автоматично. Якщо користувач вмикає відповідний перемикач, додаються тимчасові коронки за кількістю зубів,
              повторне сканування та фінальні абатменти за кількістю імплантів. Для All-on-N тимчасова конструкція вже входить у перший етап.
            </p>

            <h3 className="pt-2 font-bold text-ink">Що не входить у суму</h3>
            <p>
              КТ, консультація, видалення зубів, кісткова пластика, синус-ліфтинг, робота з м’якими тканинами, седація та хірургічний шаблон
              показуються окремим блоком «Що може знадобитися додатково» з міськими цінами. Калькулятор їх не вибирає за користувача й не
              додає до підсумку.
            </p>
          </Section>

          <Section id="sources" title="Звідки беруться ціни">
            <p>Калькулятор не зберігає ціни у програмному коді. Він читає опубліковані міські орієнтири, які складаються з двох джерел:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <b className="text-ink">Базовий орієнтир DENVA</b> — ручна середня ціна. Його обирають за пріоритетом: ціна міста, потім
                ціна області, потім загальноукраїнська ціна.
              </li>
              <li>
                <b className="text-ink">Перевірені прайси клінік</b> — клініки надсилають фактичні прайси у стандартному шаблоні. DENVA
                зіставляє рядки зі стандартними послугами й рівнями та перевіряє склад послуги. Рекламні ціни без обов’язкових компонентів і
                пакети з іншим складом у вибірку не потрапляють. Застарілі, дубльовані й тестові записи теж виключаються.
              </li>
            </ul>
          </Section>

          <Section id="aggregation" title="Як ціни об’єднуються">
            <p>
              Для кожної послуги й рівня окремо рахується вибірка перевірених локальних клінік. <b className="text-ink">Одна клініка має один
              голос</b>; філії однієї мережі з однаковим прайсом у місті рахуються як одне джерело.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b border-line-strong text-sm text-muted">
                    <th scope="col" className="py-2 pr-3 font-bold">Перевірених клінік у місті</th>
                    <th scope="col" className="px-2 py-2 font-bold">Опублікована ціна</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:px-2 [&_td]:py-2 [&_th]:py-2 [&_th]:pr-3 [&_tr]:border-b [&_tr]:border-line">
                  <tr><th scope="row" className="font-bold text-ink">3 і більше</th><td>медіана локальних прайсів</td></tr>
                  <tr><th scope="row" className="font-bold text-ink">2</th><td>⅔ медіани локальних цін + ⅓ базового орієнтира</td></tr>
                  <tr><th scope="row" className="font-bold text-ink">1</th><td>⅓ локальної ціни + ⅔ базового орієнтира</td></tr>
                  <tr><th scope="row" className="font-bold text-ink">0</th><td>100% базового орієнтира (місто, область або Україна)</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Медіана менш чутлива до окремих надто високих чи низьких прайсів, ніж середнє арифметичне. Поки локальна вибірка менша за три
              клініки, її не вважають достатньою, тому до неї додається базовий орієнтир.
            </p>
            <p>
              Іноді адміністратор DENVA тимчасово фіксує опубліковане значення (наприклад, через помилку в даних); причина такого рішення
              зберігається. Якщо для послуги немає жодного джерела, сума не вигадується: калькулятор пише, що даних поки недостатньо.
            </p>
            <p>
              Під результатом завжди вказано джерело без назв клінік: міський орієнтир, прайси кількох клінік міста чи дані області або
              України, а також дату актуальності.
            </p>
          </Section>

          <Section id="currency" title="Валюти та курс">
            <p>
              Ціни з прайсів у гривнях, євро чи доларах нормалізуються в гривні за офіційним курсом НБУ на дату розрахунку й лише після цього
              агрегуються. Основна валюта — гривня; еквівалент у євро показується для довідки. Долар використовується тільки для нормалізації
              вхідних прайсів. Курс і його дата вказані в результаті.
            </p>
          </Section>

          <Section id="updates" title="Оновлення даних">
            <p>
              Після підтвердження нової ціни перераховуються лише відповідні місто, послуга й рівень; попередні значення зберігаються в історії.
              Сторінки міст перебудовуються щодня та після кожного оновлення сайту, тому вказана дата даних — це дата останнього опублікованого
              розрахунку. Сторінка міста відкривається для пошуку лише після перевірки цін, редакційного контенту та рецензента.
            </p>
          </Section>

          <Section id="limits" title="Обмеження">
            <ul className="list-disc space-y-2 pl-5">
              <li>Це ринкова оцінка, а не прайс або пропозиція конкретної клініки.</li>
              <li>Калькулятор не бачить стану ваших зубів і кістки, тому не може визначити склад лікування.</li>
              <li>Реальна вартість залежить від системи імплантів, матеріалів, складності випадку та додаткових процедур.</li>
              <li>Для міст із малою кількістю прайсів значна частина ціни спирається на базовий орієнтир області або України.</li>
              <li>Відповіді «не знаю» дають діапазон або довідкову ціну одного зуба, а не точну суму.</li>
            </ul>
          </Section>

          <Section id="disclaimer" title="Застереження">
            <p>
              Матеріали сторінки мають інформаційний характер і не є медичною консультацією, діагнозом чи публічною офертою. Остаточну схему
              лікування та вартість визначає лікар після огляду та КТ.
            </p>
          </Section>

          <p className="mt-10">
            <Link href={CATALOG_PATH} className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-[15px] font-bold text-white hover:bg-brand-dark">
              Перейти до калькулятора
            </Link>
          </p>
        </Container>
      </main>
      <SeoFooter />
    </>
  );
}
