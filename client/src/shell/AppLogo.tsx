interface Props {
  size?: number;
  className?: string;
}

/** Athena brand mark — the same artwork as the favicon / launcher icon. */
export default function AppLogo({ size = 32, className = "" }: Props) {
  return (
    <img
      src="/icon-512.png"
      alt="Athena"
      width={size}
      height={size}
      draggable={false}
      className={`select-none object-contain ${className}`}
    />
  );
}
