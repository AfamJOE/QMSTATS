// src/components/Processed.jsx

import React, { useMemo, useState } from "react";
import "./Processed.css";

export default function Processed({
  fileCreationTotal,
  attachmentsTotal,
  rejectsTotal,

  // incoming checklist counts from each component:
  natpFile = 0,
  rtdFile = 0,
  coiFile = 0,

  natpAttach = 0,
  rtdAttach = 0,
  coiAttach = 0,

  natpReject = 0,
  rtdReject = 0,
  coiReject = 0,
}) {
  // parse the numeric totals
  const fct = Number(fileCreationTotal) || 0;
  const at = Number(attachmentsTotal) || 0;
  const rt = Number(rejectsTotal) || 0;

  // grand total of applications processed
  const totalProcessed = useMemo(() => fct + at + rt, [fct, at, rt]);

  // combined checklist totals across FileCreation, Attachments, Rejects
  const npTotal = natpFile + natpAttach + natpReject;
  const rtdTotal = rtdFile + rtdAttach + rtdReject;
  const coiTotal = coiFile + coiAttach + coiReject;

  // TL remains manual entry
  const [tl, setTl] = useState("");
  const onlyDigits = (setter) => (e) => {
    const v = e.target.value;
    if (/^\d*$/.test(v)) setter(v);
  };

  return (
    <div className="processed">
      {/* top row: raw totals */}
      <div className="processed-row main-totals">
        <div className="item">
          <label>File Creation:</label>
          <span>{fct}</span>
        </div>
        <div className="item">
          <label>Attachments:</label>
          <span>{at}</span>
        </div>
        <div className="item">
          <label>Rejects:</label>
          <span>{rt}</span>
        </div>
      </div>

      {/* middle row: grand total */}
      <div className="processed-row total-processed">
        <label>Total Applications processed:</label>
        <span>{totalProcessed}</span>
      </div>

      {/* bottom row: combined checklist totals + TL input */}
      <div className="processed-row details">
        <div className="item">
          <label>National Passport:</label>
          <span>{npTotal}</span>
        </div>
        <div className="item">
          <label>RTDs:</label>
          <span>{rtdTotal}</span>
        </div>
        <div className="item">
          <label>COIs:</label>
          <span>{coiTotal}</span>
        </div>
        <div className="item">
          <label>TL:</label>
          <input
            type="number"
            min="0"
            value={tl}
            onChange={onlyDigits(setTl)}
          />
        </div>
      </div>
    </div>
  );
}
