export default function Slide6ForManagers() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg">
      {/* Accent stripe — top */}
      <div className="absolute top-0 left-0 right-0" style={{ height: "0.6vh", background: "#28A745" }} />

      <div className="absolute inset-0 flex flex-col px-[7vw] py-[7vh]">
        {/* Heading */}
        <div>
          <div className="mb-[1.5vh]" style={{ width: "3vw", height: "0.4vh", background: "#28A745" }} />
          <h2
            className="font-display font-extrabold tracking-tight"
            style={{ fontSize: "4vw", color: "#020116", textWrap: "balance" }}
          >
            For Managers &amp; Directors
          </h2>
        </div>

        {/* Four horizontal cards */}
        <div className="flex-1 flex items-center mt-[2vh]">
          <div className="flex gap-[2vw] w-full">
            <div
              className="flex-1 flex flex-col rounded-[0.5vw] px-[2vw] py-[3vh]"
              style={{ background: "#020116" }}
            >
              <div className="mb-[2vh]" style={{ width: "1.8vw", height: "0.35vh", background: "#28A745" }} />
              <p
                className="font-display font-extrabold mb-[1.2vh]"
                style={{ fontSize: "2vw", color: "#28A745" }}
              >
                Team View
              </p>
              <p
                className="font-body text-white"
                style={{ fontSize: "1.8vw", opacity: 0.72, lineHeight: "1.5" }}
              >
                See every team member's live task and timer at a glance
              </p>
            </div>
            <div
              className="flex-1 flex flex-col rounded-[0.5vw] px-[2vw] py-[3vh]"
              style={{ background: "#020116" }}
            >
              <div className="mb-[2vh]" style={{ width: "1.8vw", height: "0.35vh", background: "#28A745" }} />
              <p
                className="font-display font-extrabold mb-[1.2vh]"
                style={{ fontSize: "2vw", color: "#28A745" }}
              >
                Approvals
              </p>
              <p
                className="font-body text-white"
                style={{ fontSize: "1.8vw", opacity: 0.72, lineHeight: "1.5" }}
              >
                Structured QC workflow before tasks are marked done
              </p>
            </div>
            <div
              className="flex-1 flex flex-col rounded-[0.5vw] px-[2vw] py-[3vh]"
              style={{ background: "#020116" }}
            >
              <div className="mb-[2vh]" style={{ width: "1.8vw", height: "0.35vh", background: "#28A745" }} />
              <p
                className="font-display font-extrabold mb-[1.2vh]"
                style={{ fontSize: "2vw", color: "#28A745" }}
              >
                Reports &amp; Export
              </p>
              <p
                className="font-body text-white"
                style={{ fontSize: "1.8vw", opacity: 0.72, lineHeight: "1.5" }}
              >
                CSV export for client billing and performance reviews
              </p>
            </div>
            <div
              className="flex-1 flex flex-col rounded-[0.5vw] px-[2vw] py-[3vh]"
              style={{ background: "#020116" }}
            >
              <div className="mb-[2vh]" style={{ width: "1.8vw", height: "0.35vh", background: "#28A745" }} />
              <p
                className="font-display font-extrabold mb-[1.2vh]"
                style={{ fontSize: "2vw", color: "#28A745" }}
              >
                Workload View
              </p>
              <p
                className="font-body text-white"
                style={{ fontSize: "1.8vw", opacity: 0.72, lineHeight: "1.5" }}
              >
                At-a-glance workload and risk indicators
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
