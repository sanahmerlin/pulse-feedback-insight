import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-6", className)}
    >
      <path
        d="M15 50 H32 C38 50 41 45 44 28 L49 15 C50 12 52 12 53 15 L58 80 C59 83 61 83 62 80 L67 55 C69 50 72 50 78 50 H85"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
