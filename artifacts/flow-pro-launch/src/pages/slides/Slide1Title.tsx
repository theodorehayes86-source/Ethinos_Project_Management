const base = import.meta.env.BASE_URL;

export default function Slide1Title() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "#020116" }}>
      {/* Hero image — full bleed, very subtle */}
      <img
        src={`${base}hero.png`}
        crossOrigin="anonymous"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.2, objectPosition: "right center" }}
      />
      {/* Left-to-right gradient overlay so left side stays readable */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(100deg, #020116 52%, rgba(2,1,22,0.55) 100%)" }}
      />
      {/* Bottom gradient */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(2,1,22,0.8) 0%, transparent 40%)" }}
      />

      <div className="absolute inset-0 flex flex-col justify-between px-[7vw] py-[6vh]">
        {/* Top bar */}
        <div className="flex items-center gap-[1.2vw]">
          <div className="h-[0.35vh]" style={{ width: "3vw", background: "#28A745" }} />
          <span
            className="font-display font-semibold tracking-widest text-white"
            style={{ fontSize: "1.5vw", letterSpacing: "0.25em", opacity: 0.9 }}
          >
            ETHINOS
          </span>
        </div>

        {/* Main content — left-aligned, vertically centered */}
        <div>
          <div className="mb-[2.5vh]" style={{ width: "4.5vw", height: "0.45vh", background: "#28A745" }} />
          <h1
            className="font-display font-extrabold tracking-tight text-white leading-none"
            style={{ fontSize: "6.5vw", textWrap: "balance", maxWidth: "52vw" }}
          >
            Ethinos Flow Pro
          </h1>
          <p
            className="font-body text-white mt-[2.5vh]"
            style={{ fontSize: "2.2vw", opacity: 0.72, maxWidth: "44vw", lineHeight: "1.5", textWrap: "pretty" }}
          >
            Your new home for project management, time tracking, and team collaboration.
          </p>
          <p
            className="font-display font-semibold mt-[1.8vh]"
            style={{ fontSize: "2vw", color: "#28A745", textWrap: "pretty" }}
          >
            Built for the Ethinos team — by the Ethinos team.
          </p>
        </div>

        {/* Bottom: date + URL */}
        <div className="flex items-center justify-between">
          <span className="font-body" style={{ fontSize: "1.6vw", color: "#6B7280" }}>
            May 2026
          </span>
          <div className="flex items-center gap-[0.8vw]">
            <div style={{ width: "0.5vw", height: "0.5vw", background: "#28A745", borderRadius: "50%" }} />
            <span className="font-body font-semibold" style={{ fontSize: "1.6vw", color: "#28A745" }}>
              flow.ethinos.com
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
