import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-900">
      <div className="text-center p-8">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        <h1 className="text-2xl font-bold text-white">404 Page Not Found</h1>
        <p className="mt-2 text-sm text-slate-400">
          Did you forget to add the page to the router?
        </p>
      </div>
    </div>
  );
}
