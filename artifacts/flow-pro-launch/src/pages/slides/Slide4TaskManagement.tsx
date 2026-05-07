export default function Slide4TaskManagement() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg">
      {/* Accent right edge bar */}
      <div
        className="absolute right-[7vw] top-[8vh] bottom-[8vh]"
        style={{ width: "0.35vw", background: "#28A745", opacity: 0.25 }}
      />

      <div className="absolute inset-0 flex flex-col px-[7vw] py-[7vh]">
        {/* Heading */}
        <div>
          <div className="mb-[1.5vh]" style={{ width: "3vw", height: "0.4vh", background: "#28A745" }} />
          <h2
            className="font-display font-extrabold tracking-tight"
            style={{ fontSize: "4.2vw", color: "#020116", textWrap: "balance" }}
          >
            Task Management
          </h2>
        </div>

        {/* 2×2 grid — flex-1 so it fills remaining space, centered */}
        <div className="flex-1 flex flex-col justify-center gap-[2.5vh] mt-[2vh]">
          <div className="flex gap-[2.5vw]">
            <div
              className="flex-1 rounded-[0.5vw] px-[2.5vw] py-[2.2vh]"
              style={{ background: "#EBF5EE" }}
            >
              <p
                className="font-display font-extrabold mb-[0.8vh]"
                style={{ fontSize: "1.6vw", color: "#28A745" }}
              >
                01
              </p>
              <p
                className="font-body font-semibold"
                style={{ fontSize: "2vw", color: "#020116", lineHeight: "1.4" }}
              >
                Log tasks against clients or internal projects
              </p>
            </div>
            <div
              className="flex-1 rounded-[0.5vw] px-[2.5vw] py-[2.2vh]"
              style={{ background: "#EBF5EE" }}
            >
              <p
                className="font-display font-extrabold mb-[0.8vh]"
                style={{ fontSize: "1.6vw", color: "#28A745" }}
              >
                02
              </p>
              <p
                className="font-body font-semibold"
                style={{ fontSize: "2vw", color: "#020116", lineHeight: "1.4" }}
              >
                Categorise by department — Growth, Strategy, Creative, and more
              </p>
            </div>
          </div>
          <div className="flex gap-[2.5vw]">
            <div
              className="flex-1 rounded-[0.5vw] px-[2.5vw] py-[2.2vh]"
              style={{ background: "#F0F4F8", border: "1px solid #D1D9E0" }}
            >
              <p
                className="font-display font-extrabold mb-[0.8vh]"
                style={{ fontSize: "1.6vw", color: "#28A745" }}
              >
                03
              </p>
              <p
                className="font-body font-semibold"
                style={{ fontSize: "2vw", color: "#020116", lineHeight: "1.4" }}
              >
                Set due dates, assignees, and priorities
              </p>
            </div>
            <div
              className="flex-1 rounded-[0.5vw] px-[2.5vw] py-[2.2vh]"
              style={{ background: "#F0F4F8", border: "1px solid #D1D9E0" }}
            >
              <p
                className="font-display font-extrabold mb-[0.8vh]"
                style={{ fontSize: "1.6vw", color: "#28A745" }}
              >
                04
              </p>
              <p
                className="font-body font-semibold"
                style={{ fontSize: "2vw", color: "#020116", lineHeight: "1.4" }}
              >
                SharePoint folder links attached directly to tasks
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
