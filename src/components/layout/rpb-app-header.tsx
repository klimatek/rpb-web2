import Image from "next/image";
import logoClimatermHeader from "@/app/climaterm.svg";

export function RpbAppHeader({ className = "" }: { className?: string }) {
  return (
    <header
      className={`rpb-fixed-header fixed top-0 right-0 left-0 z-[60] h-[92px] text-white md:h-[106px] ${className}`.trim()}
    >
      <div className="flex h-[72px] items-center justify-start px-4 pb-3 md:h-[82px] md:px-6 md:pb-4">
        <Image
          src={logoClimatermHeader}
          alt="Logo header Climaterm"
          priority
          className="h-12 w-auto md:h-16"
        />
      </div>
      <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-5 rounded-t-[28px] bg-background md:h-6 md:rounded-t-[34px]" />
    </header>
  );
}
