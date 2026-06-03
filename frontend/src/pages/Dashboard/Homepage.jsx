import React, { useEffect, useState } from "react";

import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarDays,
  Settings,
  Bell,
  Search,
  Plus,
  TrendingUp,
  IndianRupee,
  Briefcase,
  ArrowUpRight,
  Flame,
  CheckCircle2,
  Phone,
  Mail,
  LogOut,
} from "lucide-react";

import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";

const Homepage = () => {

  /* =========================
     STATES
  ========================= */

  const [showWelcome, setShowWelcome] = useState(true);

  const [leads, setLeads] = useState([]);

  const [stats, setStats] = useState({
    totalLeads: 0,
    revenue: 0,
    deals: 0,
    conversion: 0,
  });

  const [pendingTasks, setPendingTasks] = useState([]);
  const [todayMeetings, setTodayMeetings] = useState([]);
  const [meetingStats, setMeetingStats] = useState({ today: 0, upcoming: 0, pending: 0 });

  const [loading, setLoading] = useState(true);

  const userName =
    localStorage.getItem("userName") ||
    localStorage.getItem("name") ||
    "User";

  /* =========================
     WELCOME POPUP
  ========================= */

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  /* =========================
     FETCH DATA
  ========================= */

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {

    setLoading(true);

    try {

      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.log(error);
        return;
      }

      setLeads(data || []);

      const totalLeads = data?.length || 0;

      const closedDeals =
        data?.filter(
          (lead) =>
            lead.status === "Closed" ||
            lead.status === "Won"
        ).length || 0;

      const totalRevenue =
        data?.reduce((acc, item) => {
          return acc + Number(item.deal_value || 0);
        }, 0) || 0;

      const conversion =
        totalLeads > 0
          ? ((closedDeals / totalLeads) * 100).toFixed(0)
          : 0;

      setStats({
        totalLeads,
        revenue: totalRevenue,
        deals: closedDeals,
        conversion,
      });

      const pending = data
        ?.filter(
          (lead) =>
            lead.task ||
            lead.next_action ||
            lead.followup_date
        )
        ?.slice(0, 3)
        ?.map((lead) => {
          return (
            lead.task ||
            lead.next_action ||
            `Follow up with ${lead.name}`
          );
        });

      setPendingTasks(pending || []);

    } catch (err) {
      console.log(err);
    }

    // Fetch today's meetings
    try {
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
      const nextWeek   = new Date(Date.now() + 7 * 86400000);

      const { data: mtgs } = await supabase
        .from("meetings")
        .select("id, title, start_time, end_time, customer_name, company_name, mode, meeting_link, location, status")
        .in("status", ["scheduled", "confirmed"])
        .gte("start_time", todayStart.toISOString())
        .lte("start_time", nextWeek.toISOString())
        .order("start_time", { ascending: true })
        .limit(20);

      const all = mtgs || [];
      const todayList = all.filter(m => new Date(m.start_time) <= todayEnd);
      setTodayMeetings(todayList.slice(0, 5));
      setMeetingStats({
        today:    todayList.length,
        upcoming: all.filter(m => new Date(m.start_time) > todayEnd).length,
        pending:  all.length,
      });
    } catch {}

    setLoading(false);
  };

  /* =========================
     SIDEBAR MENU
  ========================= */

  const menuItems = [
    {
      icon: <LayoutDashboard size={18} />,
      link: "/dashboard",
      active: true,
    },
    {
      icon: <Users size={18} />,
      link: "/leads",
    },
    {
      icon: <UserPlus size={18} />,
      link: "/add-lead",
    },
    {
      icon: <CalendarDays size={18} />,
      link: "/team",
    },
    {
      icon: <Settings size={18} />,
      link: "/settings",
    },
  ];

  return (
    <div className="w-full h-screen bg-[#F4F7FB] flex overflow-hidden font-['Inter']">

      {/* =====================================
          SIDEBAR
      ===================================== */}

      <div className="w-[82px] bg-white border-r border-gray-200 flex flex-col justify-between items-center py-4">

        {/* TOP */}

        <div className="flex flex-col items-center">

          {/* LOGO */}

          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-black text-lg shadow-lg">
            C
          </div>

          {/* MENU */}

          <div className="flex flex-col gap-3 mt-8">

            {menuItems.map((item, index) => (
              <Link
                key={index}
                to={item.link}
                className={`
                  w-11 h-11 rounded-xl flex items-center justify-center transition-all
                  ${
                    item.active
                      ? "bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg"
                      : "bg-[#F7F9FC] text-slate-500 hover:bg-blue-50"
                  }
                `}
              >
                {item.icon}
              </Link>
            ))}
          </div>
        </div>

        {/* LOGOUT */}

        <button className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-all">
          <LogOut size={18} />
        </button>
      </div>

      {/* =====================================
          MAIN
      ===================================== */}

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* HEADER */}

        <div className="h-[72px] bg-white border-b border-gray-200 flex items-center justify-between px-7">

          <div>
            <h1 className="text-[24px] font-black text-slate-900 tracking-tight">
              Sales Dashboard
            </h1>

            <p className="text-slate-500 text-xs mt-1 font-medium">
              Manage your leads & sales activity.
            </p>
          </div>

          <div className="flex items-center gap-4">

            {/* SEARCH */}

            <div className="relative">

              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                placeholder="Search..."
                className="w-[260px] h-11 rounded-xl border border-gray-200 bg-[#F8FAFC] pl-11 pr-4 outline-none text-sm focus:border-blue-400"
              />
            </div>

            {/* USER */}

            <div className="flex items-center gap-3">

              <div className="text-right">
                <h3 className="font-bold text-sm text-slate-900">
                  {userName}
                </h3>

                <p className="text-[10px] uppercase tracking-[2px] font-black text-blue-600">
                  CRM USER
                </p>
              </div>

              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-black shadow-md text-sm">
                {userName.charAt(0)}
              </div>
            </div>
          </div>
        </div>

        {/* CONTENT */}

        <div className="flex-1 overflow-y-auto p-6">

          {/* WELCOME POPUP */}

          {showWelcome && (
            <div className="fixed inset-0 bg-black/10 backdrop-blur-[2px] z-50 flex items-center justify-center">

              <div className="bg-white rounded-[28px] w-[340px] p-8 shadow-2xl">

                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-400 mx-auto flex items-center justify-center text-white text-2xl font-black shadow-lg">
                  C
                </div>

                <h1 className="text-center text-3xl font-black text-slate-900 mt-5">
                  Welcome Back
                </h1>

                <p className="text-center text-blue-600 font-black text-2xl mt-2">
                  {userName}
                </p>
              </div>
            </div>
          )}

          {/* TASKS */}

          {pendingTasks.length > 0 && (
            <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-100 rounded-3xl p-5 mb-6">

              <div className="flex items-center gap-3">

                <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-500">
                  <Bell size={20} />
                </div>

                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    Pending Tasks
                  </h2>

                  <p className="text-slate-500 text-sm mt-1">
                    Important reminders & follow-ups.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-5">

                {pendingTasks.map((task, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-2xl border border-orange-100 p-4 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                      {task}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STATS */}

          <div className="grid grid-cols-4 gap-5">

            {[
              {
                title: "Total Leads",
                value: stats.totalLeads,
                icon: <Users size={20} />,
              },
              {
                title: "Revenue",
                value: `₹${stats.revenue}`,
                icon: <IndianRupee size={20} />,
              },
              {
                title: "Deals",
                value: stats.deals,
                icon: <Briefcase size={20} />,
              },
              {
                title: "Conversion",
                value: `${stats.conversion}%`,
                icon: <TrendingUp size={20} />,
              },
            ].map((card, index) => (
              <div
                key={index}
                className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm"
              >
                <div className="flex items-start justify-between">

                  <div>
                    <p className="text-slate-500 text-sm font-semibold">
                      {card.title}
                    </p>

                    <h2 className="text-3xl font-black text-slate-900 mt-3">
                      {card.value}
                    </h2>

                    <div className="flex items-center gap-1 text-green-500 text-sm font-bold mt-3">
                      <ArrowUpRight size={14} />
                      Live
                    </div>
                  </div>

                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white flex items-center justify-center shadow-md">
                    {card.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* MEETING STATS + TODAY'S MEETINGS */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[
              { label: "Today's Meetings",   value: meetingStats.today,    color: "text-blue-600",  bg: "bg-blue-50",  icon: <CalendarDays size={18}/> },
              { label: "Upcoming (7 days)",  value: meetingStats.upcoming, color: "text-purple-600",bg: "bg-purple-50",icon: <CalendarDays size={18}/> },
              { label: "Pending Response",   value: meetingStats.pending,  color: "text-orange-500",bg: "bg-orange-50",icon: <Bell size={18}/> },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center ${s.color}`}>{s.icon}</div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">{s.label}</p>
                  <h3 className={`text-2xl font-black ${s.color}`}>{s.value}</h3>
                </div>
              </div>
            ))}
          </div>

          {todayMeetings.length > 0 && (
            <div className="bg-white rounded-[30px] border border-gray-100 shadow-sm mt-6 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Today's Meetings</h2>
                  <p className="text-slate-500 text-sm mt-1">{todayMeetings.length} meeting{todayMeetings.length !== 1 ? "s" : ""} scheduled today.</p>
                </div>
                <Link to="/meetings" className="text-sm font-semibold text-blue-600 hover:underline">View All →</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {todayMeetings.map((m) => {
                  const timeStr = new Date(m.start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
                  const endStr  = m.end_time ? new Date(m.end_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;
                  const isOnline = m.mode === "online" || m.meeting_link;
                  return (
                    <div key={m.id} className="px-6 py-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                        {isOnline ? <Mail size={16}/> : <Phone size={16}/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-900 truncate">{m.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{m.company_name || m.customer_name || "—"} · {timeStr}{endStr ? ` – ${endStr}` : ""} IST</p>
                      </div>
                      {m.meeting_link && (
                        <a href={m.meeting_link} target="_blank" rel="noopener noreferrer"
                          className="flex-shrink-0 h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center gap-1">
                          Join
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LEADS */}

          <div className="bg-white rounded-[30px] border border-gray-100 shadow-sm mt-6 overflow-hidden">

            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">

              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  Recent Leads
                </h2>

                <p className="text-slate-500 text-sm mt-1">
                  Latest client activities.
                </p>
              </div>

              <Link
                to="/add-lead"
                className="h-11 px-5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-sm font-bold flex items-center gap-2 shadow-md"
              >
                <Plus size={16} />
                Add Lead
              </Link>
            </div>

            {/* TABLE */}

            <table className="w-full">

              <thead>
                <tr className="border-b border-gray-100">

                  <th className="text-left px-6 py-4 text-xs font-black uppercase tracking-[1px] text-slate-500">
                    Client
                  </th>

                  <th className="text-left px-6 py-4 text-xs font-black uppercase tracking-[1px] text-slate-500">
                    Company
                  </th>

                  <th className="text-left px-6 py-4 text-xs font-black uppercase tracking-[1px] text-slate-500">
                    Contact
                  </th>

                  <th className="text-left px-6 py-4 text-xs font-black uppercase tracking-[1px] text-slate-500">
                    Status
                  </th>

                  <th className="text-left px-6 py-4 text-xs font-black uppercase tracking-[1px] text-slate-500">
                    Value
                  </th>
                </tr>
              </thead>

              <tbody>

                {!loading &&
                  leads.slice(0, 6).map((lead, index) => (
                    <tr
                      key={index}
                      className="border-b border-gray-100 hover:bg-slate-50 transition-all"
                    >

                      <td className="px-6 py-5">

                        <div className="flex items-center gap-3">

                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-black shadow-md text-sm">
                            {lead.name?.charAt(0)}
                          </div>

                          <div>
                            <h3 className="font-bold text-sm text-slate-900">
                              {lead.name}
                            </h3>

                            <div className="flex items-center gap-2 text-slate-500 mt-1 text-xs">
                              <Mail size={12} />
                              {lead.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-5 text-sm font-semibold text-slate-700">
                        {lead.company}
                      </td>

                      <td className="px-6 py-5">

                        <div className="flex items-center gap-2 text-slate-600 text-sm">
                          <Phone size={13} />
                          {lead.phone}
                        </div>
                      </td>

                      <td className="px-6 py-5">

                        <div
                          className={`
                            inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold
                            ${
                              lead.status === "Hot Lead"
                                ? "bg-red-50 text-red-500"
                                : "bg-green-50 text-green-600"
                            }
                          `}
                        >

                          {lead.status === "Hot Lead" ? (
                            <Flame size={12} />
                          ) : (
                            <CheckCircle2 size={12} />
                          )}

                          {lead.status}
                        </div>
                      </td>

                      <td className="px-6 py-5 text-xl font-black text-slate-900">
                        ₹{lead.deal_value || 0}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {!loading && leads.length === 0 && (
              <div className="py-16 text-center">

                <h2 className="text-2xl font-black text-slate-900">
                  No Leads Found
                </h2>

                <p className="text-slate-500 mt-2 text-sm">
                  Add your first lead to start using CRM.
                </p>

                <Link
                  to="/add-lead"
                  className="inline-flex items-center gap-2 mt-6 px-6 h-11 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-sm font-bold shadow-lg"
                >
                  <Plus size={16} />
                  Add Lead
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;