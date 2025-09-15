import React, { useEffect, useState } from "react";
import api from "../utils/axios";
import "./Invites.css";

export default function Invites() {
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    api.get("/groups/invites")
      .then(({ data }) => setInvites(data.invites))
      .catch(console.error);
  }, []);

  const respond = (inviteId, status) => {
    api.post("/groups/invite/respond", { inviteId, status })
      .then(() => {
        setInvites(invites.filter((i) => i.inviteId !== inviteId));
      })
      .catch((err) => alert(err.response?.data?.error || err.message));
  };

  if (!invites.length) {
    return <p className="invites-empty">No pending invites.</p>;
  }

  return (
    <div className="invites-container">
      <h2>Your Group Invites</h2>
      <ul>
        {invites.map((inv) => (
          <li key={inv.inviteId} className="invite-item">
            <strong>{inv.group_name}</strong> invited you on{" "}
            {new Date(inv.created_at).toLocaleDateString()}
            <div className="invite-actions">
              <button onClick={() => respond(inv.inviteId, "accepted")}>
                Accept
              </button>
              <button onClick={() => respond(inv.inviteId, "declined")}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
