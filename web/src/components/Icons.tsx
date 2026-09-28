/** Small stroke icons, sized in em so they follow the surrounding text. */

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`} viewBox="0 0 16 16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function ChevronIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="M6 3.5 10.5 8 6 12.5" /></Svg>;
}

export function ExternalFileIcon() {
  return (
    <Svg>
      <path d="M9 2.5H4.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6" />
      <path d="M9 2.5 12.5 6H9.5a.5.5 0 0 1-.5-.5z" />
    </Svg>
  );
}

export function CommentIcon() {
  return <Svg><path d="M3 3.5h10a.5.5 0 0 1 .5.5v6.5a.5.5 0 0 1-.5.5H7l-3 2.5V11H3a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /></Svg>;
}

export function FlagIcon({ filled = false }: { filled?: boolean }) {
  return (
    <Svg>
      <path d="M4 14V2.5" />
      <path d="M4 3h7.5l-1.75 3 1.75 3H4" fill={filled ? "currentColor" : "none"} />
    </Svg>
  );
}

export function CheckIcon() {
  return <Svg><path d="m3.5 8.5 3 3 6-7" /></Svg>;
}
