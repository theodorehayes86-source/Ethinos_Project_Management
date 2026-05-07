export default function Slide8Closing() {
  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: "#020116" }}>
      {/* Central glow */}
      <div
        className="absolute"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "60vw",
          height: "60vh",
          background: "radial-gradient(ellipse, rgba(40,167,69,0.1) 0%, transparent 70%)",
          borderRadius: "50%",
        }}
      />
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0" style={{ height: "0.5vh", background: "#28A745" }} />
      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.5vh", background: "#28A745", opacity: 0.4 }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-[8vw]">
        {/* Label */}
        <div className="flex items-center gap-[1.5vw] mb-[3.5vh]">
          <div style={{ height: "0.3vh", width: "3vw", background: "#28A745" }} />
          <span
            className="font-display font-semibold tracking-widest"
            style={{ fontSize: "1.5vw", color: "#28A745", letterSpacing: "0.22em" }}
          >
            ETHINOS
          </span>
          <div style={{ height: "0.3vh", width: "3vw", background: "#28A745" }} />
        </div>

        {/* Main headline */}
        <h2
          className="font-display font-extrabold tracking-tight text-white leading-tight"
          style={{ fontSize: "5vw", textWrap: "balance", maxWidth: "70vw" }}
        >
          Flow Pro is live and ready for the whole team.
        </h2>

        {/* Divider */}
        <div className="my-[3.5vh]" style={{ width: "5vw", height: "0.4vh", background: "#28A745" }} />

        {/* Supporting text */}
        <p
          className="font-body text-white"
          style={{ fontSize: "2.1vw", opacity: 0.68, lineHeight: "1.55", textWrap: "pretty" }}
        >
          Questions? Feedback? Reach your admin.
        </p>

        {/* URL */}
        <p
          className="font-display font-semibold mt-[2.5vh]"
          style={{ fontSize: "2.4vw", color: "#28A745" }}
        >
          flow.ethinos.com
        </p>
      </div>
    </div>
  );
}
