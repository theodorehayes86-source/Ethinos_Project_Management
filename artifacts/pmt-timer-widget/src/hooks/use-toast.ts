export function useToast() {
  return {
    toast: (_props: { title?: string; description?: string }) => {},
    dismiss: (_toastId?: string) => {},
    toasts: [],
  };
}

export function toast(_props: { title?: string; description?: string }) {}
