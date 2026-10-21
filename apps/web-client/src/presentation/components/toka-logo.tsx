interface TokaLogoProps {
  className?: string;
}

export function TokaLogo({ className = 'h-14 w-auto' }: TokaLogoProps) {
  return <img src="/brand/toka-logo.png" alt="Toka" className={className} />;
}
