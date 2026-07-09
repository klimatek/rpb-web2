import type { ReactNode } from "react";
import { RpbAppHeader } from "@/components/layout/rpb-app-header";
import { RpbBottomNav } from "@/components/layout/rpb-bottom-nav";

interface RpbPageFrameProps {
  children: ReactNode;
  containerClassName?: string;
  shellClassName?: string;
  headerClassName?: string;
  contentClassName?: string;
  noContentPadding?: boolean;
  showBottomNav?: boolean;
}

export function RpbPageFrame({
  children,
  containerClassName = "",
  shellClassName = "",
  headerClassName = "",
  contentClassName = "",
  noContentPadding = false,
  showBottomNav = true,
}: RpbPageFrameProps) {
  const bottomPaddingClass = showBottomNav ? "pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-24" : "";
  const contentOffsetClass = "pt-[92px] md:pt-[106px]";
  const contentMinHeightClass = "min-h-[calc(100vh-92px)] md:min-h-[calc(100vh-106px)]";
  const contentPaddingClass = noContentPadding
    ? ""
    : "mx-auto w-full max-w-screen-2xl px-4 sm:px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-24";

  return (
    <div className={`min-h-screen w-full bg-background ${containerClassName}`.trim()}>
      <RpbAppHeader className={headerClassName} />
      <main className={`relative min-h-screen ${contentOffsetClass}`}>
        <div className={`rpb-shell relative -mt-[2px] ${contentMinHeightClass} ${shellClassName}`.trim()}>
          <div
            className={`relative ${contentPaddingClass} ${bottomPaddingClass} ${contentClassName}`.trim()}
          >
            <div className="pointer-events-none absolute top-0 right-0 left-0 h-px bg-white" />
            {children}
          </div>
        </div>
      </main>
      {showBottomNav ? <RpbBottomNav /> : null}
    </div>
  );
}
