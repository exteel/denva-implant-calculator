import { Button } from "@/components/ui/Button";

/** Calm error state: backend not configured / unreachable. */
export function UnavailableState({ onRetry, unavailable }: { onRetry?: () => void; unavailable: boolean }) {
  return (
    <div role="alert" className="mt-6 rounded-2xl border border-warn-line bg-warn-soft p-5">
      <p className="text-[17px] font-extrabold text-warn">Калькулятор тимчасово недоступний</p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
        {unavailable
          ? "Ми вже працюємо над цим. Будь ласка, зайдіть трохи пізніше."
          : "Не вдалося завантажити ціни. Перевірте з’єднання з інтернетом і спробуйте ще раз."}
      </p>
      {onRetry && !unavailable && (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          Спробувати ще раз
        </Button>
      )}
    </div>
  );
}
