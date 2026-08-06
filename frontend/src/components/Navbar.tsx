import { NavLink, useNavigate } from "react-router-dom";

export default function Navbar() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <nav>
      <div className="container inner">
        <span className="brand">🌬 AirWatch</span>
        <div className="links">
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? "active" : ""}>Dashboard</NavLink>
          <NavLink to="/devices"   className={({ isActive }) => isActive ? "active" : ""}>Devices</NavLink>
          <button onClick={logout}>Logout</button>
        </div>
      </div>
    </nav>
  );
}
