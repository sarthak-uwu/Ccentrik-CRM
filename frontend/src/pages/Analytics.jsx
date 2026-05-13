import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "../services/analyticsService";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, FunnelChart, Funnel, LabelList
} from "recharts";
import { format } from "date-fns";
import { TrendingUp, DollarSign, Users, Target, Award, CheckSquare } from "lucide-react";

const COLORS = ["#1B76D3", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#3B82F6"];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0F172A", borderRadius: 8, padding: "8px 12px", color: "white", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color || "#94A3B8" }}>
          {p.name}: {typeof p.value === "number" && (p.name?.toLowerCase().includes("revenue") || p.name?.toLowerCase().includes("value")) ? `$${p.value.toLocaleString()}` : p.value}
        </div>
      ))}
    </div>
  );
};

function SectionCard({ title, children, span = 1 }) {
  return (
    <div className="card" style={{ padding: 20, gridColumn: `span ${span}` }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>{title}</h3>
      {children}
    </div>
  );
}

export default function Analytics() {
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats"], queryFn: analyticsService.getDashboardStats });
  const { data: revenueData } = useQuery({ queryKey: ["monthly-revenue", 12], queryFn: () => analyticsService.getMonthlyRevenue(12) });
  const { data: leadsStage } = useQuery({ queryKey: ["leads-by-stage"], queryFn: analyticsService.getLeadsByStage });
  const { data: leadsSource } = useQuery({ queryKey: ["leads-by-source"], queryFn: analyticsService.getLeadsBySource });
  const { data: monthlyLeads } = useQuery({ queryKey: ["monthly-leads", 12], queryFn: () => analyticsService.getMonthlyLeads(12) });
  const { data: dealsByStage } = useQuery({ queryKey: ["deals-by-stage"], queryFn: analyticsService.getDealsByStage });
  const { data: teamPerf } = useQuery({ queryKey: ["team-performance"], queryFn: analyticsService.getTeamPerformance });

  const fmtRevenue = revenueData?.map((r) => ({
    month: r.month ? format(new Date(r.month + "-01"), "MMM yy") : r.month,
    revenue: r.revenue,
  })) || [];

  const fmtLeads = monthlyLeads?.map((r) => ({
    month: r.month ? format(new Date(r.month + "-01"), "MMM yy") : r.month,
    leads: r.leads,
    won: r.won,
  })) || [];

  const kpis = [
    { label: "Total Revenue", value: `$${(stats?.revenue || 0).toLocaleString()}`, icon: DollarSign, color: "#10B981", change: "+12%" },
    { label: "Total Leads", value: stats?.totalLeads || 0, icon: Target, color: "#1B76D3", change: "+8%" },
    { label: "Active Deals", value: stats?.activeDeals || 0, icon: TrendingUp, color: "#F59E0B", change: "+5%" },
    { label: "Conversion Rate", value: `${stats?.conversionRate || 0}%`, icon: Award, color: "#8B5CF6", change: "+2%" },
    { label: "Active Customers", value: stats?.activeCustomers || 0, icon: Users, color: "#3B82F6", change: "+3%" },
    { label: "Pending Tasks", value: stats?.pendingTasks || 0, icon: CheckSquare, color: "#EF4444", change: "" },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1600 }}>
      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="stat-card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${kpi.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <kpi.icon size={16} style={{ color: kpi.color }} />
              </div>
              {kpi.change && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#10B981", background: "#D1FAE5", padding: "2px 6px", borderRadius: 20 }}>
                  {kpi.change}
                </span>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 10 }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Revenue Trend */}
        <SectionCard title="Revenue Over Time (12 months)">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={fmtRevenue}>
              <defs>
                <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1B76D3" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1B76D3" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#1B76D3" strokeWidth={2.5} fill="url(#revGrad2)" dot={false} activeDot={{ r: 5, fill: "#1B76D3" }} />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Deals by Stage */}
        <SectionCard title="Deals Pipeline">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(dealsByStage || []).map((stage, i) => (
              <div key={stage.stage}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{stage.stage}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11.5, color: "#94A3B8" }}>{stage.count}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>${(stage.value / 1000).toFixed(0)}k</span>
                  </div>
                </div>
                <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3 }}>
                  <div style={{ height: "100%", background: COLORS[i % COLORS.length], borderRadius: 3, width: `${Math.min((stage.count / Math.max(...(dealsByStage || []).map((d) => d.count), 1)) * 100, 100)}%`, transition: "width 0.5s" }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Lead Generation */}
        <SectionCard title="Lead Generation Trend">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={fmtLeads}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="leads" name="Leads" fill="#1B76D3" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="won" name="Won" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Leads by Stage */}
        <SectionCard title="Lead Stage Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={leadsStage?.filter((d) => d.count > 0) || []} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="stage" paddingAngle={3}>
                {(leadsStage || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
              <Legend formatter={(v) => <span style={{ fontSize: 10.5, color: "#64748B" }}>{v}</span>} iconSize={7} />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Leads by Source */}
        <SectionCard title="Leads by Source">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={leadsSource || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis dataKey="source" type="category" tick={{ fontSize: 10.5, fill: "#475569" }} axisLine={false} tickLine={false} width={72} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Leads" fill="#8B5CF6" radius={[0, 3, 3, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Team Performance Table */}
      <SectionCard title="Team Performance">
        <div style={{ overflowX: "auto" }}>
          <table className="crm-table">
            <thead>
              <tr>
                <th>TEAM MEMBER</th>
                <th>ROLE</th>
                <th>LEADS</th>
                <th>DEALS</th>
                <th>WON DEALS</th>
                <th>REVENUE CLOSED</th>
                <th>TASKS DONE</th>
                <th>WIN RATE</th>
              </tr>
            </thead>
            <tbody>
              {(teamPerf || []).filter((m) => m.leads > 0 || m.deals > 0).map((member) => (
                <tr key={member.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt={member.name} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EBF4FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#1B76D3" }}>
                          {member.name?.[0]}
                        </div>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{member.name}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "#64748B", textTransform: "capitalize" }}>{member.role?.replace("_", " ")}</td>
                  <td style={{ fontSize: 13, fontWeight: 600 }}>{member.leads}</td>
                  <td style={{ fontSize: 13 }}>{member.deals}</td>
                  <td>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#10B981" }}>{member.wonDeals}</span>
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 600, color: "#10B981" }}>
                    {member.revenue > 0 ? `$${member.revenue.toLocaleString()}` : "—"}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {member.completedTasks}/{member.tasks}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 3, maxWidth: 60 }}>
                        <div style={{ height: "100%", background: "#10B981", borderRadius: 3, width: `${member.deals > 0 ? Math.round((member.wonDeals / member.deals) * 100) : 0}%` }} />
                      </div>
                      <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>
                        {member.deals > 0 ? Math.round((member.wonDeals / member.deals) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {!(teamPerf || []).filter((m) => m.leads > 0 || m.deals > 0).length && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "#94A3B8" }}>No performance data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
