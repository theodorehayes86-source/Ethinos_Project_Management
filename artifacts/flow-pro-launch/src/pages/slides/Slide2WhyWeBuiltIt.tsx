export default function Slide2WhyWeBuiltIt() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg">
      {/* Accent block — top right corner */}
      <div
        className="absolute top-0 right-0"
        style={{ width: "28vw", height: "100vh", background: "#EBF5EE", opacity: 0.6 }}
      />
      {/* Green vertical bar separating columns */}
      <div
        className="absolute"
        style={{ left: "41vw", top: "10vh", bottom: "10vh", width: "0.2vw", background: "#28A745", opacity: 0.35 }}
      />

      <div className="absolute inset-0 flex px-[7vw] py-[7vh]">
        {/* Left: section label + heading */}
        <div className="flex flex-col justify-center pr-[3vw]" style={{ width: "34%" }}>
          <div className="mb-[2vh]" style={{ width: "3vw", height: "0.4vh", background: "#28A745" }} />
          <h2
            className="font-display font-extrabold tracking-tight leading-tight"
            style={{ fontSize: "4.5vw", color: "#020116", textWrap: "balance" }}
          >
            Why We Built It
          </h2>
          <p
            className="font-body mt-[2.5vh]"
            style={{ fontSize: "2vw", color: "#6B7280", lineHeight: "1.5", textWrap: "pretty" }}
          >
            The challenge we set out to solve.
          </p>
        </div>

        {/* Right: four numbered pain points */}
        <div className="flex flex-col justify-center gap-[3.5vh] pl-[4vw]" style={{ width: "66%" }}>
          <div className="flex items-start gap-[2vw]">
            <span
              className="font-display font-extrabold shrink-0"
              style={{ fontSize: "2.2vw", color: "#28A745", lineHeight: "1", marginTop: "0.3vh" }}
            >
              01
            </span>
            <p
              className="font-body"
              style={{ fontSize: "2.2vw", color: "#0D0D1A", lineHeight: "1.45", textWrap: "pretty" }}
            >
              Tasks scattered across emails, chats, and spreadsheets
            </p>
          </div>
          <div className="flex items-start gap-[2vw]">
            <span
              className="font-display font-extrabold shrink-0"
              style={{ fontSize: "2.2vw", color: "#28A745", lineHeight: "1", marginTop: "0.3vh" }}
            >
              02
            </span>
            <p
              className="font-body"
              style={{ fontSize: "2.2vw", color: "#0D0D1A", lineHeight: "1.45", textWrap: "pretty" }}
            >
              No single view of what everyone is working on
            </p>
          </div>
          <div className="flex items-start gap-[2vw]">
            <span
              className="font-display font-extrabold shrink-0"
              style={{ fontSize: "2.2vw", color: "#28A745", lineHeight: "1", marginTop: "0.3vh" }}
            >
              03
            </span>
            <p
              className="font-body"
              style={{ fontSize: "2.2vw", color: "#0D0D1A", lineHeight: "1.45", textWrap: "pretty" }}
            >
              Time logging was manual and inconsistent
            </p>
          </div>
          <div className="flex items-start gap-[2vw]">
            <span
              className="font-display font-extrabold shrink-0"
              style={{ fontSize: "2.2vw", color: "#28A745", lineHeight: "1", marginTop: "0.3vh" }}
            >
              04
            </span>
            <p
              className="font-body"
              style={{ fontSize: "2.2vw", color: "#0D0D1A", lineHeight: "1.45", textWrap: "pretty" }}
            >
              Client work had no structured tracking
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
