import { toast } from "sonner"
import { translate } from "@/app/i18n"
import { errorText } from "@/lib/errors"

export function toastUndo(message: string, undo: () => Promise<void>, after?: () => void) {
  toast(message, {
    duration: 8000,
    action: {
      label: translate("Отменить"),
      onClick: () => {
        undo()
          .then(after)
          .catch((e) => toast.error(translate("Не удалось восстановить"), { description: errorText(e) }))
      },
    },
  })
}
