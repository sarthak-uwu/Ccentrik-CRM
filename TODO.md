# Ccentrik CRM Enhancement - Implementation Tracker

## Plan steps

### Dashboard UI (post-login only)
- [ ] Replace/clean `frontend/src/pages/Dashboard.jsx`:
  - [ ] Remove: dashboard search bar, notification bell icon, static greeting text, clutter widgets
  - [ ] Add Greeting Popup (show once after login, auto-dismiss after 3s)
  - [ ] Add Today’s Focus section (Tasks due today, overdue follow-ups, scheduled meetings, deals with no recent activity)
    - [ ] Each item clickable and includes “Take Action” CTA that opens relevant Lead/Deal/Task
  - [ ] Add Quick Action Buttons: Add Lead, Add Deal, Add Task, Schedule Meeting, Target Review
    - [ ] Must open modal/side drawer (no navigation)

### Tasks system
- [ ] Update `frontend/src/pages/Tasks.jsx` to ensure correct tab behavior and highlight rules
- [ ] Ensure task click deep-links to linked Lead/Deal
- [ ] Add automatic reminder popup for incomplete tasks

### Leads + Leads schema
- [ ] Update backend Lead model/controller:
  - [ ] Lead ID auto-generated + unique
  - [ ] Required fields + services multi-select + standardized Lead Status
  - [ ] Last Activity Date + Next Action + optional Lead Score
- [ ] Update `frontend/src/pages/Leads.jsx` + `frontend/src/components/LeadDetailPanel.jsx`
  - [ ] UI for Lead ID (read-only), services multi-select, standardized statuses, mandatory remarks

### Services dropdown
- [ ] Backend + frontend options standardized and persisted

### Deals pipeline + schema
- [ ] Update backend Deal model/controller + stages
- [ ] Update `frontend/src/pages/Deals.jsx` to show required card fields + stuck indicator

### Activities + automation
- [ ] Update activity types, mandatory remarks
- [ ] Update Lead/Deal last activity + next action
- [ ] Automation: “Proposal Sent” moves deal stage

### Scheduling reminders
- [ ] Meetings link to Lead/Deal + reminder logic

### Targets
- [ ] Add target model + UI + quick action integration

### Bulk operations
- [ ] CSV/Excel upload + template download + role restriction

### Global UI cleanup
- [ ] Dark theme consistency, minimal borders/cards, remove bright colors/over-animation

