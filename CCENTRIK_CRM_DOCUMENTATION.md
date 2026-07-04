# CCENTRIK CRM
## Official User Manual
### Version 1.0

---

**Document Type:** User Manual
**Prepared For:** All Ccentrik CRM Users
**Classification:** Internal Use

---

---

# TABLE OF CONTENTS

1. Introduction
2. Getting Started
3. User Roles & Permissions
4. Dashboard
5. CRM Modules
   - 5.1 Pipeline (Prospects)
   - 5.2 Leads
   - 5.3 Deals
   - 5.4 Activities
   - 5.5 Meetings
   - 5.6 DSR – Daily Sales Report
   - 5.7 Reports
   - 5.8 Analytics
   - 5.9 Targets
   - 5.10 Team Management
   - 5.11 Email Integration
   - 5.12 Security Logs
   - 5.13 Settings
   - 5.14 Chat
   - 5.15 ARIA – AI Sales Assistant
6. End-to-End CRM Workflow
7. Common Business Scenarios
8. Frequently Asked Questions
9. Troubleshooting
10. Best Practices

---

---

# CHAPTER 1 — INTRODUCTION

## 1.1 Purpose of the CRM

Ccentrik CRM is a cloud-based Customer Relationship Management platform designed specifically for B2B sales teams in the technology and SAP services industry. It provides a single, unified workspace to manage prospects, leads, deals, activities, meetings, and daily sales reporting — enabling your sales team to work efficiently and your managers to stay informed in real time.

The platform is accessible from any device with a browser and an internet connection. No software installation is required.

## 1.2 Who Should Use It

Ccentrik CRM is designed for everyone involved in the sales process:

| User Type | Primary Use |
|-----------|-------------|
| Super Admin (Owner) | System configuration, user management, full oversight |
| Sales Head | Team oversight, reports, DSR, approvals |
| Sales Manager | Team activity monitoring, record management |
| Sales Employee | Managing own leads, deals, and activities |
| Inside Sales Employee | Phone and email outreach, lead follow-up |

## 1.3 Business Workflow Overview

The typical workflow in Ccentrik CRM follows this path:

```
Prospect Identified
        |
        v
  Added to Pipeline
        |
        v
  Qualify the Prospect
        |
        v
  Convert to Lead
        |
        v
  Log Activities (Calls, Emails, Meetings)
        |
        v
  Send Proposal --> Convert to Deal
        |
        v
  Negotiate and Close
        |
        v
  Mark Won / Lost
        |
        v
  Daily Sales Report Sent Automatically
```

## 1.4 Key Benefits

- **Centralised data** — All customer and prospect information in one place
- **Role-based access** — Each team member sees only what they need
- **Real-time updates** — Changes appear immediately for all users
- **Automated reporting** — Daily Sales Reports sent automatically every evening
- **AI assistance** — ARIA helps draft emails, summarise notes, and analyse deals
- **Mobile-friendly** — Works on phones, tablets, and desktops

---

---

# CHAPTER 2 — GETTING STARTED

## 2.1 Login Process

Open your browser and go to: **https://ccentrik-crm.web.app**

You will see the Ccentrik login screen.

**Step 1:** Enter your username (your first name or assigned username — do NOT type @ccentrik.com, the system adds it automatically).

**Step 2:** Enter your password.

**Step 3:** Click **Sign In**.

**Alternative:** Click **Sign in with Google** if your organisation uses Google Workspace with a @ccentrik.com account.

> **Note:** Only @ccentrik.com email accounts are permitted. Personal Gmail accounts are blocked.

> **Forgot your password?** Click the "Forgot Password?" link on the login screen and follow the email instructions.

[Login Screen Screenshot]

## 2.2 Dashboard Overview

After login, you are taken directly to the **Dashboard** — your central command centre. The Dashboard shows:

- Key performance indicators (KPI cards) at the top
- Your activities for today, overdue items, and upcoming events
- Pipeline health chart
- Upcoming meetings
- Deals needing attention

## 2.3 Navigation

**Sidebar (Left Panel)**
The sidebar is your main navigation menu. Click any item to open that module. On mobile devices, tap the hamburger menu in the top-left to expand the sidebar. The sidebar can be collapsed to icon-only view by clicking the arrow at the bottom.

**Header (Top Bar)**
The header contains:
- **Search** — Click the search icon or press Ctrl+K to search across all records
- **Notifications** — Bell icon shows alerts for follow-ups, meetings, and mentions
- **Brain icon** — Opens the ARIA AI assistant panel (available on all pages)
- **Theme toggle** — Switch between light and dark mode
- **Your profile avatar** — Shows your name and role

## 2.4 User Profile

Click your avatar in the top-right corner to:
- View your profile name and role
- Access account settings
- Log out

## 2.5 Logging Out

Click your avatar then select **Logout**. Your session ends immediately. For security, always log out when using a shared computer.

---

---

# CHAPTER 3 — USER ROLES & PERMISSIONS

## 3.1 Overview

Ccentrik CRM uses a five-tier role system. Your role is assigned by your Super Admin and determines which modules you can access, which records you can see, and what actions you can take.

## 3.2 Role Descriptions

### Super Admin (Owner)
The highest level of access. Typically assigned to the business owner or IT administrator.
- **Access:** All modules and features
- **Can:** Create/delete users, configure system settings, view all records, lock/unlock any record, access security logs, set targets for all users, configure DSR
- **Restrictions:** None

### Sales Head
Senior sales manager responsible for team performance.
- **Access:** All sales modules + Reports, Analytics, Targets, Team management
- **Can:** View and edit all team records, reassign records, approve deals, lock/unlock records, configure DSR, download reports, set targets for team
- **Restrictions:** Cannot manage system settings or create new user accounts

### Sales Manager
Team leader overseeing a group of sales employees.
- **Access:** Dashboard, Pipeline, Leads, Deals, Activities, Meetings, DSR, limited Reports
- **Can:** View team records, reassign within team, manage activities, lock/unlock records
- **Restrictions:** Cannot access full Reports/Analytics, cannot manage all users, cannot set targets

### Sales Employee
Front-line sales representative.
- **Access:** Dashboard, Pipeline, Leads, Deals, Activities, Meetings, DSR, Chat, ARIA
- **Can:** Create and manage own records, log activities, schedule meetings
- **Restrictions:** Can only view own assigned records; cannot delete records, cannot access Reports or Team management

### Inside Sales Employee
Focuses on inbound/outbound calls and emails.
- **Access:** Same as Sales Employee
- **Can:** Log call and email activities, manage assigned leads, schedule follow-ups
- **Restrictions:** Same as Sales Employee

## 3.3 Role Permission Matrix

| Feature | Super Admin | Sales Head | Sales Manager | Sales Employee | Inside Sales |
|---------|:-----------:|:----------:|:-------------:|:--------------:|:------------:|
| Dashboard | Yes | Yes | Yes | Yes | Yes |
| Pipeline | Yes | Yes | Yes | Yes | Yes |
| Leads | Yes | Yes | Yes | Yes | Yes |
| Deals | Yes | Yes | Yes | Yes | Yes |
| Activities | Yes | Yes | Yes | Yes | Yes |
| Meetings | Yes | Yes | Yes | Yes | Yes |
| DSR | Yes | Yes | Yes | Yes | Yes |
| Reports | Yes | Yes | Limited | No | No |
| Analytics | Yes | Yes | No | No | No |
| Targets | Yes | Yes | No | No | No |
| Team Mgmt | Yes | Yes | No | No | No |
| Settings | Yes | Yes | No | No | No |
| Security Logs | Yes | Yes | No | No | No |
| Chat | Yes | Yes | Yes | Yes | Yes |
| ARIA AI | Yes | Yes | Yes | Yes | Yes |
| Create Users | Yes | No | No | No | No |
| Delete Records | Yes | Yes | No | No | No |
| Lock/Unlock Records | Yes | Yes | No | No | No |
| Reassign Records | Yes | Yes (any) | Team only | No | No |
| Set Targets | Yes | Yes | No | No | No |
| Export Data | Yes | Yes | Limited | No | No |

---

---

# CHAPTER 4 — DASHBOARD

The Dashboard is the first screen you see after login. It provides an at-a-glance view of your day, your pipeline, and your team's performance.

[Dashboard Screenshot]

## 4.1 KPI Strip (Top Metric Cards)

Four key numbers are displayed at the very top of the Dashboard:

| Card | What It Shows | Why It Matters |
|------|--------------|----------------|
| Pipeline Total Value | Combined estimated value of all active pipeline entries | Shows total opportunity in the funnel |
| Total Leads | Number of active qualified leads | Tracks inbound and outbound lead volume |
| Active Deals | Number of open deals in progress | Indicates current revenue opportunities |
| Revenue Won | Total revenue from closed-won deals this period | Measures actual sales performance |

## 4.2 Smart Activity Strip

This tabbed panel organises all your tasks and follow-ups into clear categories:

- **Overdue** — Activities past their due date (shown in red; requires immediate attention)
- **Today** — Activities due today
- **Tomorrow** — Activities due the next day
- **Upcoming** — Activities due within the next 7 days
- **Meetings** — Scheduled meetings only
- **Anytime** — Activities with no specific due date
- **Completed** — Recently completed activities

Each activity card shows the priority level with a colour code:
- RED — Urgent: Drop everything, do this now
- ORANGE — High: Complete today
- BLUE — Medium: Normal priority
- GREEN — Low: Do when time permits

## 4.3 My Activities Widget

Shows your top 10 open activities. Click any item to open its detail view. This widget is your personal to-do list.

## 4.4 Pipeline Health Chart

A visual progression chart showing how many prospects are in each stage:

**New > Contacted > Meeting > Proposal > Negotiation > Won**

This helps you identify where prospects are getting stuck and which stage needs the most attention.

## 4.5 Upcoming Meetings Widget

Shows your next 5 scheduled meetings with:
- Meeting title and client name
- Date and time
- Mode indicator (Virtual / In-person)

Click any meeting to view its full details.

## 4.6 Deals Needing Action

A red-alert section showing deals that require immediate attention:
- **Stale deals** — Not updated in 5 or more days
- **Closing soon** — Expected close date is within 7 days

## 4.7 ORG Activities Centre (Sales Head and Above)

Available only to Sales Head, Sales Manager, and Super Admin. Shows team-wide activity status:

- **4 columns:** Overdue | Pending | Today | Upcoming
- **Filters:** By team member, by module (Pipeline, Leads, Deals, Meetings), by date range
- **Views:** Grid view or Workload matrix (table showing counts per team member)

This widget helps managers spot overloaded or underperforming team members at a glance.

---

---

# CHAPTER 5 — CRM MODULES

---

## 5.1 Pipeline (Prospects)

[Pipeline Screenshot]

### Overview
The Pipeline module is where you record all potential clients before they are formally qualified as leads. Think of it as your prospecting database — companies you are researching, targeting, or have made initial contact with.

### Pipeline Stages

| Stage | Meaning |
|-------|---------|
| New Prospect | Just identified; no contact made yet |
| Attempted Contact | Reached out but no response |
| Engaged | Prospect has responded or shown interest |
| Qualified | Confirmed fit; ready to convert to Lead |
| Not Interested | Prospect has declined or is not a fit |

### Adding a New Prospect

1. Click the **+ Add Prospect** button (top-right)
2. Fill in the required fields:
   - **Company Name** (required)
   - Contact Name and Designation
   - Headquarters: Country, State, City
   - Website and LinkedIn URLs
   - Industry and Source
   - Services of Interest: SAP Implementation, Migration, Upgrade, Resource Augmentation, Other
3. Set the Pipeline Stage and Follow-up Date
4. Add Remarks if needed
5. Click **Save**

### Key Actions

| Action | How to Perform | Who Can |
|--------|---------------|---------|
| Add Prospect | Click + Add Prospect button | All |
| Edit | Click the pencil icon on any row | Creator or assigned user |
| Convert to Lead | Click Convert icon (requires email or phone) | All |
| Delete | Delete icon | Sales Head and above |
| Import CSV | Click Import then upload your file | All |
| Export CSV | Click Export button | Sales Head and above |
| View History | Click history icon on the record | All |
| Lock Record | Lock icon | Sales Head and above |

### Importing Prospects via CSV

1. Click **Import**
2. Click **Download Template** to get the correct CSV format
3. Fill in your prospect data in the downloaded template
4. Upload the completed file
5. Review the validation preview (errors are highlighted in red)
6. Confirm the import

### Filters Available

Filter your pipeline view by: Source, Stage, Industry, Assigned User, Company Name, Date Added.

### Important Notes
- Always add a Follow-up Date so the prospect appears in your Activity Strip on that day
- Use the "Qualified" stage to mark prospects ready for conversion
- A prospect **cannot** be converted to a Lead without an email address or phone number

---

## 5.2 Leads

[Leads Screenshot]

### Overview
Leads are qualified prospects who have shown genuine interest in your services. They can be created directly or converted from the Pipeline module. Each lead is tracked through stages from first contact to conversion into a deal.

### Lead Stages

| Stage | Meaning |
|-------|---------|
| New | Lead just added; initial contact not made |
| Contacted | Initial outreach made |
| Qualified | Budget, authority, need, and timeline confirmed |
| Proposal | Proposal or quote has been sent |
| Converted | Lead has become an active deal |
| Won | Successfully converted to client |
| Lost | Lead did not progress further |

### Lead Temperature

| Temperature | Meaning |
|-------------|---------|
| Hot | Very likely to convert; needs priority attention |
| Warm | Interested but not yet committed |
| Cold | Low interest or slow to respond |

### Lead Score (0 to 100)

Each lead is automatically assigned a score based on:
- **Stage** — More advanced stages score higher (up to 40 points)
- **Source quality** — High-quality sources like Referral score higher (up to 20 points)
- **Recency** — Leads with recent activity score higher (up to 15 points)

Score colour guide:
- Green (70 to 100) = Strong lead
- Orange (40 to 69) = Moderate
- Red (0 to 39) = Weak or stale

### Adding a New Lead

1. Click **+ Add Lead**
2. Fill in:
   - Company Name (required)
   - Contact Name, Designation, Email, Phone
   - Industry, Source, Headquarters
   - Temperature and Stage
   - Services of Interest
   - Remarks
3. Optionally log an **Initial Activity** (call, email, etc.) at the time of creation
4. Click **Save**

A unique code such as LEAD-0042 is auto-generated for every lead.

### Key Actions

| Action | Description |
|--------|-------------|
| Edit | Update lead details |
| Mark Proposal Sent | Moves lead to Proposal stage and optionally creates a Deal |
| Convert to Deal | Directly creates a linked Deal record |
| Change Temperature | Quick toggle between Hot, Warm, and Cold |
| Import | Bulk-add leads via CSV |
| Export | Download all leads as CSV |
| View Activity History | See all logged activities for this lead |
| Bulk Status Change | Select multiple leads and change stage or temperature together |

---

## 5.3 Deals

[Deals Screenshot]

### Overview
The Deals module tracks active sales opportunities that have progressed beyond the lead stage. Deals can be viewed as a Kanban board with visual drag-and-drop, or as a standard table list.

### Deal Stages and Win Probability

| Stage | Win Probability |
|-------|----------------|
| New | 5% |
| Contacted | 15% |
| Meeting Scheduled | 30% |
| Proposal Sent | 50% |
| Negotiation | 75% |
| Won | 100% |
| Lost | 0% |

### Deal Health Indicators

| Status | Meaning |
|--------|---------|
| Active | Updated within the last 3 days |
| At Risk | Not updated in 3 to 7 days |
| Stale | Not updated in 7 or more days |

### Creating a Deal

1. Click **+ Add Deal** or convert directly from a Lead
2. Fill in:
   - Title (required)
   - Company Name (required)
   - Contact details: email or phone is required
   - Deal Value in Indian Rupees
   - Expected Close Date
   - Temperature: Hot, Warm, or Cold
   - Stage and win probability
3. Click **Save**

### Kanban Board View

The Kanban board shows deals as cards organised by stage. You can:
- **Drag and drop** a card to move it to the next stage
- See the deal value, close date, temperature, win probability bar, and assigned person on each card
- See an alert on cards that are stale (not updated in 7+ days)

### Analytics Bar (Top of Deals Page)

| Metric | Description |
|--------|-------------|
| Total Pipeline Value | Sum of all open deal values |
| Weighted Forecast | Value multiplied by win probability per deal |
| Won This Month | Revenue from deals marked Won in current month |
| Average Deal Size | Total pipeline value divided by open deal count |
| At Risk Count | Number of deals that are at risk (shown in red if greater than zero) |

### Marking a Deal as Won or Lost

**To Mark Won:**
1. Click the **Mark Won** button on the deal card or detail view
2. Confirm the action
3. The deal moves to the Won column and is added to revenue calculations

**To Mark Lost:**
1. Click **Mark Lost**
2. Select a reason: Price too high / Chose competitor / No budget / No decision / Wrong timing / Requirements not met / Other
3. If "Other" is selected, enter a custom reason
4. Confirm

### Converting a Won Deal to Customer

After marking a deal as Won, click **Convert to Customer** to create a formal customer record.

### Reverting a Deal

A deal can be reverted:
- Back to **Lead** (if it was converted from a lead)
- Back to **Pipeline** (if it was converted from a pipeline entry)

---

## 5.4 Activities

[Activities Screenshot]

### Overview
Activities are the core records of every customer interaction — every call made, email sent, meeting held, or follow-up scheduled. The Activities module is your complete interaction history and personal task manager.

### Activity Types

| Type | Description |
|------|-------------|
| Call | Outbound or inbound phone call |
| Follow-up Call | Scheduled callback after previous contact |
| Email | Email sent to prospect or lead |
| Follow-up Email | Follow-up to a previous email |
| Meeting Virtual | Online video meeting |
| Meeting In-Person | Face-to-face meeting |
| WhatsApp | WhatsApp message or chat |
| WhatsApp Follow-up | Follow-up via WhatsApp |
| Note | Internal note or memo |
| Break | Scheduled break for tracking purposes |

### Logging an Activity

1. Click **+ Add Activity**
2. Select the activity **Type**
3. Enter a **Title**
4. Set **Priority**: Urgent, High, Medium, or Low
5. Set **Status**: Pending, In Progress, or Completed
6. Set **Due Date and Time**
7. Link to a **Lead or Deal** (optional but strongly recommended)
8. Assign to a team member (managers only)
9. Add a **Description** with notes, outcome, and agenda
10. Click **Save**

### View Modes

**Timeline View:** Activities grouped by time period — Overdue, Today, Tomorrow, Upcoming, Completed. Best for daily task management.

**Table View:** All activities in a sortable, filterable table. Useful for reporting and audit.

**Kanban Board:** Four columns — To-Do, In Progress, Completed, and Overdue. Drag cards between columns to update status.

**Calendar View:** Activities plotted on a monthly calendar. Best for visualising your schedule.

**User Grouped View:** Activities organised by team member, then by date. Useful for managers reviewing team workload.

### Smart Filters

| Filter | Shows |
|--------|-------|
| Today | All activities due today |
| Meetings Today | Only meeting-type activities today |
| Follow-ups Due | Overdue follow-ups requiring action |
| High Priority | Urgent and High priority items only |
| Lead Activities | Activities linked to your assigned leads |
| Deal Activities | Activities linked to your assigned deals |
| Recently Added | Activities created in the last 48 hours |

---

## 5.5 Meetings

[Meetings Screenshot]

### Overview
The Meetings module manages all scheduled client and internal meetings. It supports virtual (online) and in-person meetings, sends calendar invites automatically, and tracks outcomes.

### Scheduling a Meeting

1. Click **+ Schedule Meeting**
2. Fill in:
   - **Title** (required)
   - Client Name and Company Name
   - Customer Email and Phone
   - **Date and Time** with timezone selector
   - **Duration**: 15 minutes to 2 hours
   - **Mode**: Online or In-Person
3. For **Online meetings:**
   - Select platform: Google Meet or Jitsi
   - A meeting link is auto-generated for Jitsi, or paste your Google Meet link
4. For **In-person meetings:**
   - Enter location using Google Maps autocomplete
   - Coordinates are filled in automatically
5. Select **Meeting Purpose**: Follow-up, Discovery Call, Demo, Negotiation, Proposal Discussion, Requirement Gathering, Onboarding, Support, Client Presentation, Payment Discussion, Closing, or Others
6. Add **Team Attendees** by searching and selecting from your team
7. Add external attendee email addresses separated by commas
8. Write an **Agenda** and any **Internal Notes**
9. Link to a **CRM record**: Lead, Deal, or Pipeline entry
10. Click **Save** — a calendar invite (iCal) is sent to all attendees automatically

> **Conflict Detection:** The system alerts you if another meeting already exists at the same date and time.

### Meeting Status Values

| Status | Meaning |
|--------|---------|
| Scheduled | Upcoming meeting that has not yet occurred |
| Completed | Meeting was held |
| Cancelled | Meeting was cancelled |
| Rescheduled | Meeting was moved to a new time |

### Meeting Outcome (Post-Completion)

When marking a meeting as Completed, select an outcome:
- Won, Positive, Neutral, Negative, or No Show

### Available Views

- **Calendar View** — Monthly grid with meetings colour-coded by status
- **List View** — Card layout with all details visible
- **Grid View** — Responsive card grid for scanning many meetings

### Log Follow-up

After any meeting, click **Log Follow-up** to instantly create a new meeting pre-filled with the same client details. This saves time when scheduling the next interaction.

---

## 5.6 DSR — Daily Sales Report

[DSR Screenshot]

### Overview
The Daily Sales Report (DSR) is an automated email sent to managers and owners each evening summarising the day's sales activity. It covers the entire team's performance.

### What the DSR Shows

- New leads added during the day
- Pipeline entries created
- Deals won and lost (with value)
- Activities logged: calls, emails, meetings
- Meetings completed
- Proposals sent
- Inactivity alerts for team members with no recorded activity

### Automatic DSR (Scheduled Send)

The system automatically sends the DSR every day at **9:00 PM IST**.

- **Field Staff DSR** — sent to Sales Heads and Super Admins
- **Sales Head DSR** — sent to Super Admins only

No action is required from users — the system handles it automatically.

### Manual DSR (On-Demand)

To generate and send a report immediately:
1. Go to **DSR** in the sidebar
2. Click **Send Report Now**
3. The report is generated and emailed instantly

### Personal Scheduler Configuration

Individual users can configure their own automatic report schedule:
1. Go to **DSR > Settings**
2. Enable the scheduler toggle
3. Choose your preferred time slot
4. Select which team members to include
5. Select report type: Daily, Weekly, or Monthly
6. Save

---

## 5.7 Reports

[Reports Screenshot]

### Overview
The Reports module — available to Sales Head and above — provides pre-built analytical reports covering all key sales metrics.

### Available Reports

| Report | What It Shows |
|--------|--------------|
| Lead Pipeline Analysis | Leads by stage, count, and aging |
| Deal Forecast | Open deals by stage, value, probability, and close date |
| Revenue Dashboard | Month-to-date, quarter-to-date, and year-to-date revenue vs. target |
| Team Performance | Activities, conversions, and lead counts per person |
| Activity Audit | All CRM actions logged by user |
| Lead Temperature Distribution | Breakdown of Hot, Warm, and Cold leads |

### Exporting Reports

1. Open any report
2. Click **Export** in the top-right
3. Choose format: **CSV** or **PDF**
4. The file downloads immediately

---

## 5.8 Analytics

[Analytics Screenshot]

### Overview
The Analytics module provides visual charts and graphs for trend analysis. Available to Sales Head and Super Admin only.

### Charts Available

- **Area Chart** — Pipeline value over time, showing growth or decline trends
- **Bar Chart** — Deal count per stage; Revenue broken down by lead source
- **Pie Chart** — Lead distribution by source; Deal split by owner

All charts update automatically as new data is added to the CRM.

---

## 5.9 Targets

### Overview
The Targets module (Sales Head and above) allows managers to set and track performance goals for individuals and teams.

### Target Types

| Target | Metric Tracked |
|--------|--------------|
| Revenue Target | Total deal value to close in a period |
| Lead Target | Number of new leads to add |
| Deal Count Target | Number of deals to close |
| Conversion Target | Percentage of pipeline entries to convert to leads |

### Setting a Target

1. Go to **Targets**
2. Click **+ Set Target**
3. Select the team member or team
4. Choose the period: Monthly, Quarterly, or Yearly
5. Enter the target value
6. Click **Save**

### Tracking Progress

Each target displays:
- A progress bar showing actual versus target
- Percentage completion
- Time remaining in the current period

---

## 5.10 Team Management

[Team Screenshot]

### Overview
The Team module — accessible to Sales Head and Super Admin — manages user accounts and the team structure.

### Adding a New User

1. Go to **Team**
2. Click **+ Add Member**
3. Enter Full Name and Email address
4. Select the Role
5. Assign a supervisor if applicable
6. Click **Save** — the user receives a welcome email with login instructions

### User Role Reference

| Role Code | Display Name |
|-----------|-------------|
| owner | Super Admin |
| sales_head | Sales Head |
| sales_manager | Sales Manager |
| inside_sales | Inside Sales Employee |
| employee | Sales Employee |

### Managing Existing Users

| Action | How to Perform |
|--------|---------------|
| Edit user details | Click the edit icon on the user row |
| Deactivate a user | Toggle status to Inactive |
| Reassign their records | Available when deactivating a user |
| View activity log | Click on a user to see their full activity history |

---

## 5.11 Email Integration

### Overview
Ccentrik CRM integrates with Gmail to allow you to send, receive, and track emails directly within the platform without opening a separate email client.

### Key Features

- **Email Composer** — Draft and send emails from within any lead or deal record
- **Email Templates** — Pre-saved email templates with variable substitution such as name and company
- **Email Logging** — Sent emails are automatically logged as Activities
- **Email Tracking** — See when your email was opened or links were clicked
- **Email Activity Log** — All email interactions for a record are displayed in its history

### Sending an Email from a Record

1. Open any Lead or Deal
2. Click the **Email** icon or **Send Email** button
3. The email composer opens pre-filled with the contact's email address
4. Select a template (optional) or write your message
5. Click **Send**
6. The email is sent and automatically logged as an activity on that record

---

## 5.12 Security Logs

[Security Logs Screenshot]

### Overview
Security Logs — available to Super Admin and Sales Head — provide a complete audit trail of all actions taken within the CRM.

### Tracked Events

| Event | Details Recorded |
|-------|-----------------|
| Login / Logout | Timestamp, IP address, browser |
| Failed login attempt | IP address, timestamp, attempt count |
| Record created | User, module, record ID, timestamp |
| Record edited | User, field changed, old value, new value, timestamp |
| Record deleted | User, record details, timestamp |
| Data export | User, export type, number of records |
| Bulk operations | User, operation type, affected records |

### Using Security Logs

1. Go to **Security Logs** in the sidebar
2. Use filters to narrow down: by user, date range, event type, or module
3. Click any row to see the full details of what changed
4. Click **Export** to download the audit log as a CSV file

---

## 5.13 Settings

### Overview
System settings are accessible to Super Admin and Sales Head.

### Available Configurations

| Setting | Description |
|---------|-------------|
| Company Profile | Company name, logo, timezone |
| Currency | Configured as Indian Rupee with Lakh and Crore formatting |
| Email Notifications | Toggle notifications for follow-ups, meetings, and mentions |
| Meeting Reminders | Set reminders at 15 minutes, 30 minutes, or 1 hour before a meeting |
| Password Policy | Minimum length and complexity requirements |
| Session Timeout | Automatically log out after a period of inactivity |
| Login Attempt Limits | Lock account after a set number of failed attempts |
| DSR Schedule | Enable or disable the automated DSR and set the send time |

---

## 5.14 Chat

### Overview
The built-in Chat module enables real-time messaging between team members without leaving the CRM.

### Features

- **Direct Messages** — One-to-one messaging with any team member
- **Group Chats** — Create group conversations by department or team
- **@ Mentions** — Tag a team member to send them a notification
- **Message Search** — Search through chat history
- **Typing Indicators** — See when someone is composing a message

### Using Chat

1. Click **Chat** in the sidebar
2. Select an existing conversation or click **+ New Chat**
3. Search for a team member and start a conversation
4. Press Enter or click Send to deliver your message

---

## 5.15 ARIA — AI Sales Assistant

[ARIA Screenshot]

### Overview
ARIA (AI Revenue Intelligence Assistant) is Ccentrik's built-in AI agent. It has live access to your CRM data and can answer questions, analyse deals, and help you take actions — all without leaving your current page.

### Accessing ARIA

**Method 1:** Click the Brain icon in the header (available on every page). This opens the ARIA floating panel on the right side of your screen while you stay on your current module.

**Method 2:** Click **Ccentrik AI** in the sidebar for the full-screen AI chat interface.

### What ARIA Can Do

| Capability | Example Message |
|-----------|----------------|
| Query live CRM data | "Show me all hot leads" |
| Pipeline summary | "What is my total pipeline value?" |
| Stale deal analysis | "Which deals have not been updated in 7 days?" |
| Today's follow-ups | "What do I need to follow up on today?" |
| Create records | "Create a task: Call Nikon tomorrow at 10 AM" |
| Log activities | "Log a call with Rahul at ABC Corp" |
| Assign leads | "Assign the TechCorp lead to Priya" |

### How ARIA Works

ARIA reads your CRM data in real time. When you ask a question, it queries the live database before answering — it never guesses or uses outdated data.

For write actions such as creating or updating records, ARIA always shows you a **confirmation card** before executing. You must click **Approve** for the action to proceed. ARIA never modifies your data without your explicit approval.

### Context Awareness

ARIA knows which page you are on. If you are on the Leads page and ask "show me hot ones," it will immediately query hot leads — no need to specify the module each time.

### Language Support

ARIA understands and responds in **English, Hindi, and Hinglish**. Write to it in whichever language is most comfortable for you.

---

---

# CHAPTER 6 — END-TO-END CRM WORKFLOW

This chapter explains the complete sales process from initial prospecting to deal closure.

```
STEP 1: Login
  Open ccentrik-crm.web.app and sign in with your credentials

           |
           v

STEP 2: Check Dashboard
  Review overdue activities, today's meetings, and deals needing attention

           |
           v

STEP 3: Add Prospect to Pipeline
  Pipeline > + Add Prospect > Fill in company details > Save

           |
           v

STEP 4: Research and Qualify
  Update pipeline stage: New Prospect > Engaged > Qualified
  Log activities (calls, emails) as you reach out

           |
           v

STEP 5: Convert to Lead
  Click Convert on the pipeline record > Confirm
  Lead is created with unique LEAD-XXXX code

           |
           v

STEP 6: Work the Lead
  Log all interactions in Activities
  Schedule Meetings as interest grows
  Update Lead Temperature (Hot / Warm / Cold)
  Update Lead Stage as progress is made

           |
           v

STEP 7: Send Proposal > Convert to Deal
  Click "Mark Proposal Sent" on the lead
  A Deal is created with deal value and close date

           |
           v

STEP 8: Manage the Deal
  Track the deal in the Deals Kanban Board
  Drag the card through stages as progress is made
  Log activities and meetings against the deal

           |
           v

STEP 9: Close the Deal
  Click "Mark Won" (or "Mark Lost" with reason)
  Won deal contributes to Revenue Won metric
  Optionally convert to Customer record

           |
           v

STEP 10: Daily Report
  At 9 PM IST, the DSR is automatically emailed to Sales Heads and Admins
  All of today's activities, leads, and deals are summarised automatically
```

---

---

# CHAPTER 7 — COMMON BUSINESS SCENARIOS

## Scenario 1: Adding a New Prospect from a LinkedIn Search

1. Go to **Pipeline > + Add Prospect**
2. Enter Company Name, Contact Name, and LinkedIn URL
3. Set Stage to **New Prospect** and Source to **LinkedIn**
4. Add a Follow-up Date for when you plan to reach out
5. Save
6. The prospect will appear in your Activity Strip on the follow-up date as a reminder

## Scenario 2: Logging a Call Outcome

1. Go to **Activities > + Add Activity**
2. Select Type: **Call**
3. Enter Title: "Initial call with [Company Name]"
4. Set Priority: High
5. Set Status: **Completed**
6. Link to the relevant Lead or Pipeline record
7. In the Description field, note the outcome: Interested, Not Interested, Call Back, etc.
8. Save

## Scenario 3: Converting a Lead to a Deal

1. Open the Lead record
2. Confirm the Lead Stage is at least **Qualified** or **Proposal**
3. Click **Convert to Deal** or **Mark Proposal Sent**
4. Enter:
   - Deal Title
   - Deal Value in Indian Rupees
   - Expected Close Date
5. Confirm the conversion
6. The lead stage updates to **Converted** and a linked Deal record is created automatically

## Scenario 4: Scheduling a Follow-up Meeting

1. Go to **Meetings > + Schedule Meeting**
2. Select the linked CRM record to auto-fill contact information
3. Set Date, Time, and Duration
4. Select Mode: Online (Google Meet) or In-Person
5. Add Team Attendees by searching your team
6. Set Purpose: **Follow-up**
7. Write a brief Agenda
8. Save — a calendar invite is sent automatically to all attendees

## Scenario 5: Tracking Your Team's Performance (Managers)

1. Go to **Dashboard**
2. Scroll to **ORG Activities Centre**
3. Use the team member dropdown to filter by individual
4. Switch to **Workload View** to see a matrix of all team members and their activity counts
5. Go to **Reports > Team Performance** for a detailed breakdown
6. Export as PDF or CSV to share in team review meetings

## Scenario 6: Marking a Deal as Lost and Recording the Reason

1. Open the Deal in the Kanban Board or Table View
2. Click **Mark Lost**
3. Select the loss reason: Price too high, Chose competitor, No budget, No decision, Wrong timing, Requirements not met, or Other
4. If Other: type a custom reason in the text field
5. Click **Confirm**
6. The deal is archived with the loss reason preserved for reporting

## Scenario 7: Generating an Immediate DSR

1. Go to **DSR** in the sidebar
2. Click **Send Report Now**
3. The system compiles the full day's activity and emails it to all configured recipients within seconds

---

---

# CHAPTER 8 — FREQUENTLY ASKED QUESTIONS

**Q: I cannot log in. What should I do?**
A: Ensure you are entering your username only — do not include @ccentrik.com, as the system adds it automatically. Check that Caps Lock is off. If you have forgotten your password, click the "Forgot Password?" link on the login page and follow the instructions in the email you receive.

**Q: I cannot see the Reports or Analytics module in the sidebar.**
A: These modules are only visible to Sales Head and Super Admin roles. If you believe you need access, contact your Super Admin to review your role assignment.

**Q: I cannot convert a prospect to a Lead.**
A: A Pipeline record must have either an email address or a phone number before it can be converted. Edit the record, add the missing contact detail, and then try converting again.

**Q: A record shows as locked and I cannot edit it.**
A: Records can be locked by a Sales Head or Super Admin to prevent accidental changes. Contact your manager to have the record unlocked.

**Q: The DSR email is not arriving. What should I check?**
A: First check your spam or junk folder. If the email is not there, ask your Super Admin to verify that your email address is in the DSR recipient list and that the automatic scheduler is enabled in Settings.

**Q: I accidentally marked a deal as Lost. Can it be reversed?**
A: Yes. Open the deal and look for the **Revert to Lead** or **Revert to Pipeline** option depending on where the deal originated. Contact your Sales Head if these options are not visible.

**Q: Can I import leads from an Excel file?**
A: Yes. Download the CSV template by clicking the Import button in Leads or Pipeline. Fill in your data in Excel, save the file as CSV format, and then upload it using the Import button.

**Q: How do I know if my email to a client was opened?**
A: Go to the Activity log for that lead or deal. Emails sent via the Email Integration show open and click tracking status once the recipient interacts with the email.

**Q: Can ARIA create records without my approval?**
A: No. ARIA always shows a confirmation card describing exactly what it will do before making any changes. You must explicitly click Approve for any write action to proceed.

**Q: Why does the Dashboard show old data even after I add records?**
A: The Dashboard refreshes automatically when you navigate to it. If you see stale data, click the refresh icon on any widget or do a full page reload using Ctrl+Shift+R on Windows.

**Q: Can I use the CRM on my mobile phone?**
A: Yes. Ccentrik CRM is designed to work on mobile browsers. Open the URL in Chrome or Safari on your phone. The layout adjusts automatically for smaller screens.

**Q: How do I change my password?**
A: Click your profile avatar in the top-right corner, go to Account Settings, and select Change Password. If you cannot log in to do this, use the "Forgot Password?" link on the login page.

---

---

# CHAPTER 9 — TROUBLESHOOTING

## 9.1 Login Problems

| Problem | Solution |
|---------|----------|
| "Invalid credentials" error | Check username (no @ccentrik.com needed) and password; check Caps Lock |
| Account appears locked | Contact Super Admin — too many failed login attempts may lock the account |
| Google Sign-In not working | Ensure you are using a @ccentrik.com Google Workspace account |
| Blank screen after login | Clear browser cache using Ctrl+Shift+Del and try again |
| Redirected back to login immediately | Session has expired — log in again |

## 9.2 Missing Features or Permissions

| Problem | Solution |
|---------|----------|
| Module not visible in sidebar | Your role does not have access — contact Super Admin to review your role |
| Cannot edit a record | Record may be locked — ask Sales Head to unlock it |
| Cannot delete a record | Deletion requires Sales Head or Super Admin role |
| Cannot reassign a record | Reassignment requires Sales Head or higher |
| Cannot see other team members' records | Normal for Sales Employee role — only own assigned records are visible |

## 9.3 Import and Export Issues

| Problem | Solution |
|---------|----------|
| CSV import shows validation errors | Use the downloaded template — column headers must match exactly |
| Duplicate records appearing on import | System detects duplicates by company name and email — review the preview before confirming |
| Export file not downloading | Check browser download settings; ensure downloads are allowed from the site |
| Fields missing from export | Some fields are excluded from basic export — use the Reports module for comprehensive exports |

## 9.4 Activities and Meetings

| Problem | Solution |
|---------|----------|
| Calendar invite not received by attendees | Verify attendee email addresses are correct; ask them to check their spam folder |
| Meeting conflict warning appearing | The system detected an existing meeting at the same time — reschedule to a different slot |
| Activity not appearing in today's DSR | Activities must be logged on the same calendar day to appear in that day's DSR |
| Cannot mark an activity as Done | The activity may be assigned to another user — contact the assignee or your manager |

## 9.5 Common User Mistakes to Avoid

| Mistake | Correct Approach |
|---------|-----------------|
| Including @ccentrik.com in the username field | Enter only the username portion before the @ symbol |
| Creating duplicate leads for the same company | Search before adding — use the search bar or filters to check if the company already exists |
| Not linking activities to leads or deals | Always select the related record when logging an activity to keep history clean |
| Setting a follow-up date in the past | The Activity Strip shows overdue items in red — update the date or mark the task complete |
| Leaving deal stage as New for weeks | Update the stage after every meaningful interaction — the stage reflects actual pipeline health |
| Not writing remarks after calls | Notes help your team (and future you) understand the context when reviewing a record later |

---

---

# CHAPTER 10 — BEST PRACTICES

## 10.1 Recommended Daily Routine

**Morning — Start of Day**
1. Log in and open the **Dashboard**
2. Check the **Overdue** tab in the Smart Activity Strip — resolve these first before starting new work
3. Review the **Today** tab — plan your day around these tasks
4. Check the **Upcoming Meetings** widget to prepare for client interactions

**During the Day**
5. Log every call, email, and meeting in **Activities** immediately after it happens — memory fades quickly
6. Update lead stages and deal stages as progress is made — do not let records sit at old stages
7. Respond to follow-up reminders promptly to maintain momentum with prospects

**End of Day**
8. Review the **Today** tab — mark completed tasks as Done
9. Set follow-up dates for any open items so they appear as reminders tomorrow
10. The DSR will be sent automatically at 9 PM IST — no action required

## 10.2 Data Quality Tips

- **Always link activities to a CRM record** — Do not create floating activities without a lead or deal. Unlinked activities will not appear in reports or the contact's history.
- **Keep lead temperatures current** — A Hot lead that goes cold without being updated misleads the pipeline analysis and wastes manager review time.
- **Update deal close dates realistically** — Stale close dates in the past distort the revenue forecast and make it unreliable.
- **Write meaningful remarks** — One sentence of context in the remarks field can save 10 minutes of re-research in the future.
- **Use lead codes and deal codes when communicating** — When discussing a record with a colleague, reference the LEAD-XXXX or DEAL-XXXX code to avoid confusion.

## 10.3 Team Collaboration

- Use **@ mentions in Chat** to notify teammates about specific records without leaving the CRM
- When handing over a lead to a colleague, use **Reassign** and add a remark explaining the relationship history and next steps
- Before a client meeting, open the linked CRM record to review the full conversation history and previous activity logs
- After a meeting, immediately log the outcome as an activity and set the next follow-up before moving on

## 10.4 Using ARIA Effectively

- Ask ARIA before manually searching — "Show me stale deals" is faster than setting filters manually
- Describe context when asking ARIA to draft emails: "Draft a follow-up email for TechCorp after a positive product demo"
- Use ARIA to create tasks through conversation: "Remind me to follow up with Nikon next Monday morning"
- Always review ARIA's confirmation card carefully before clicking Approve — confirm the data is correct

## 10.5 Manager Best Practices

- Review the **ORG Activities Centre** on the Dashboard daily — a team member with zero activities for two consecutive days needs attention
- Use the **Workload Matrix** view to redistribute leads when one person is overloaded and another is underutilised
- Set **Targets** at the beginning of each month; review mid-month to address shortfalls early
- Run the **Team Performance** report every Friday and use the data in weekly review meetings
- Lock important deal records to prevent accidental edits during active negotiations

## 10.6 Pipeline Health Habits

- A healthy pipeline has prospects at every stage — if everything is stuck at "Attempted Contact," revisit outreach strategy
- Review deals in **At Risk** status every Monday and either update them or escalate them
- Use the **Deal Forecast** report to prepare for management presentations — it shows probability-weighted revenue projections
- Convert won deals to Customer records promptly so the client database stays current

---

---

*This document was prepared based on the Ccentrik CRM Version 1 source code.*
*For technical support or to report issues, contact your system administrator.*

---

**END OF DOCUMENT**
