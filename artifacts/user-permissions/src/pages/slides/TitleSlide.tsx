const base = import.meta.env.BASE_URL;

export default function TitleSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg">
      <img
        src={`${base}hero-access.jpg`}
        crossOrigin="anonymous"
        alt="Layered access gates"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#101427]/95 via-[#101427]/80 to-[#101427]/30" />
      <div className="absolute inset-0 flex flex-col justify-center pl-[8vw] pr-[40vw]">
        <p className="font-body text-[1.6vw] font-semibold tracking-[0.3em] uppercase text-[#7dd3fc]">
          Ethinos Flow Pro
        </p>
        <h1
          className="font-display font-bold text-[6vw] leading-[1.05] text-white mt-[3vh] tracking-tight"
          style={{ textWrap: 'balance' }}
        >
          User Permissions
        </h1>
        <p className="font-body text-[2.1vw] text-white/85 mt-[4vh] leading-relaxed">
          Who can see what, role by role — desktop &amp; mobile
        </p>
        <p className="font-body text-[1.5vw] text-white/60 mt-[2vh]">
          August 2026 · Internal reference
        </p>
      </div>
      <div className="absolute bottom-0 left-0 w-full h-[1.2vh] bg-gradient-to-r from-[#3730a3] via-[#0e7490] to-transparent" />
    </div>
  );
}
