# CCENTRIK CRM
## Phase 1 – Project Documentation & Functional Analysis

---

**Document Title:** CCENTRIK CRM – Phase 1 Executive Documentation & Functional Analysis
**Document Type:** Business & Functional Documentation
**Version:** 1.0
**Date:** June 2026
**Prepared By:** CCENTRIK Product & Technology Team
**Audience:** Management, Sales Leadership, Project Managers, Business Users, Clients

---

---

# PHASE 1 – CCENTRIK CRM OVERVIEW

---

## Project Introduction

CCENTRIK CRM is a purpose-built Customer Relationship Management platform designed specifically for SAP consulting and services businesses. It provides a centralized, intelligent workspace where Sales teams can manage the complete lifecycle of a sales opportunity — from an initial prospect inquiry all the way through to a signed deal and active customer relationship.

Phase 1 of CCENTRIK CRM represents the complete foundational build of the platform, covering all core sales workflows, team collaboration features, daily reporting, performance tracking, and management oversight tools.

---

## Business Objective

The primary objective of CCENTRIK CRM is to provide Sales Teams, Sales Management, and Leadership with:

- A single platform to manage all sales activities and interactions
- Real-time visibility into pipeline health and team performance
- Structured, role-based access so every team member sees exactly what is relevant to their work
- Automated productivity tracking and reporting to reduce manual effort
- Data-driven insights to improve sales conversion rates and revenue outcomes

---

## CRM Vision

CCENTRIK CRM is built on the vision that great sales performance comes from three things: **clarity**, **accountability**, and **consistency**. Every feature in the platform is designed to give sales professionals clear direction on what to do next, hold teams accountable for their activities, and create consistent, measurable processes across the entire sales organization.

---

## Target Users

| User Group | Role in Organization |
|---|---|
| Super Admin / Owner | Company Owner, CRM Administrator |
| Sales Head | National or Regional Sales Head |
| Sales Manager | Territory or Segment Manager |
| Sales Employee | Field Sales Representative |
| Inside Sales Employee | Inside Sales / Telesales Representative |

---

## Business Problems Solved

| # | Business Problem | How CCENTRIK CRM Solves It |
|---|---|---|
| 1 | Sales data scattered across spreadsheets and emails | Centralized platform with all data in one place |
| 2 | No visibility into team activities | Live activity tracking with timeline and audit trail |
| 3 | Leads getting lost or unassigned | Structured lead assignment with ownership tracking |
| 4 | No clear pipeline or deal progress visibility | Visual pipeline with stage-based deal tracking |
| 5 | Manual daily reporting is time-consuming | Automated DSR generation with one-click PDF download |
| 6 | Management cannot monitor team performance in real time | Role-based dashboards and reporting for managers |
| 7 | Meetings not tracked or followed up | Full meeting management with RSVP and outcome logging |
| 8 | No lead scoring or prioritization | AI-powered lead scoring (0-100 scale) |
| 9 | No structured follow-up process | Scheduled activities with overdue tracking and alerts |
| 10 | Communication history lost across emails and calls | In-CRM email composer with automatic communication history |

---

## Key Benefits

- **Sales Team** saves time on reporting, follow-ups, and data entry
- **Sales Managers** gain real-time visibility into team performance without chasing updates
- **Sales Head & Leadership** receive structured reports with KPIs, revenue forecasts, and productivity scores
- **Management** can make data-backed decisions on resource allocation, target setting, and strategy

---

---

# 1. EXECUTIVE SUMMARY

---

## What is CCENTRIK CRM?

CCENTRIK CRM is a cloud-based Sales CRM platform built for the SAP consulting industry. It manages every stage of the sales cycle — from the very first prospect contact through to a won deal — and provides leadership with complete visibility into every deal, activity, and team member's performance.

The platform is accessible from any browser, secured with enterprise-grade login controls, and designed to be simple enough for day-to-day use by Sales Employees while powerful enough to serve the complex reporting and analytics needs of Senior Management.

## Who Uses It?

CCENTRIK CRM is used by five distinct types of users — each with their own set of permissions, visibility, and daily workflows:

- **Super Admin (Owner)**: Full access to the entire system, including user management, all reports, and all records across the organization.
- **Sales Head**: Views and manages all team data, runs performance reports, sets targets, and oversees pipeline health.
- **Sales Manager**: Manages their own pipeline and team members, runs team-level reports, and tracks activities.
- **Sales Employee**: Works on their own assigned leads, deals, and activities. Focused on daily selling activities.
- **Inside Sales Employee**: Similar to Sales Employee — manages their own assigned records with inside-sales focus.

## What Business Processes Does It Manage?

CCENTRIK CRM manages the complete end-to-end sales lifecycle:

1. **Prospecting** → Pipeline management for early-stage prospects
2. **Lead Management** → Full qualification, nurturing, and conversion
3. **Deal Management** → Tracking deal progress through to closure
4. **Meeting Management** → Scheduling, tracking, and outcome logging
5. **Activity Tracking** → Calls, emails, follow-ups, notes — all logged
6. **Daily Sales Reporting (DSR)** → Automated productivity and performance reporting
7. **Target Management** → Individual and team target assignment and tracking
8. **Analytics & Reporting** → Revenue, pipeline, and performance insights

---

## Executive Summary Table

| Area | Description |
|---|---|
| **Platform Type** | Cloud-based Sales CRM |
| **Industry Focus** | SAP Consulting & Services |
| **Total Modules** | 12 functional modules |
| **User Roles** | 5 distinct roles with hierarchy-based access |
| **Lead Stages** | 7 structured stages (New → Won / Lost) |
| **Pipeline Stages** | 5 stages (New Prospect → Qualified / Not Interested) |
| **Deal Stages** | 7 funnel stages with win probability weightings |
| **Activity Types** | 8 types (Calls, Emails, Notes, Meetings, WhatsApp) |
| **Meeting Types** | 13 meeting purposes, online and in-person |
| **DSR Reporting** | Daily, Weekly, Monthly, Quarterly, Half-Yearly, Yearly |
| **Lead Scoring** | Automated AI Score (0–100) on every lead |
| **Email** | In-CRM email composer with full send history |
| **Exports** | CSV and PDF supported across all modules |
| **Access Control** | Role-based — field users see only their own data |

---

---

# 2. SYSTEM OVERVIEW

---

## CRM Purpose

CCENTRIK CRM exists to replace fragmented, manual sales tracking with a single, structured, and intelligent platform. Every team member — from a field sales representative to the company owner — has a personalized view that shows them exactly what they need to do today and how their performance compares to targets.

## End-to-End Sales Lifecycle

The CRM models the complete journey of a sales opportunity across four distinct conversion stages:

```
PIPELINE (Prospect) → LEAD (Qualified) → DEAL (Active Sale) → CUSTOMER (Won)
```

Each stage has its own structured workflow, with the system guiding users through the right steps at the right time.

---

## High-Level System Overview

| Module | Business Function | Primary Users |
|---|---|---|
| **Dashboard** | KPIs, activity summaries, quick actions | All roles |
| **Pipeline** | Early-stage prospect tracking | All sales roles |
| **Leads** | Lead qualification, nurturing, conversion | All sales roles |
| **Deals** | Active deal tracking through to closure | All sales roles |
| **Meetings** | Schedule, track, and log meeting outcomes | All sales roles |
| **Activities** | Log all sales interactions and follow-ups | All sales roles |
| **DSR** | Daily Sales Reports and productivity scoring | All sales roles |
| **Targets** | Set and track individual/team performance targets | Manager roles |
| **Reports** | Revenue, pipeline, and performance reporting | Manager & above |
| **Analytics** | Visual insights on sales trends and conversion | Manager & above |
| **Team** | User management and performance overview | Manager & above |
| **AI Assistant** | Intelligent sales queries and CRM assistance | All roles |
| **Email** | In-CRM email composer and communication history | All sales roles |
| **Security Logs** | Login, audit, and data access monitoring | Owner only |

---

---

# 3. ROLE-BASED ACCESS MODEL

---

CCENTRIK CRM uses a strict, five-level role hierarchy. Each role has clearly defined responsibilities, permissions, and data visibility boundaries. Senior roles have broader visibility and more control; field roles are focused on their own work.

---

## Super Admin (Owner)

**Responsibilities:**
The Super Admin is the highest authority in the CRM. They are responsible for system configuration, user management, data integrity, and full organizational oversight.

**Permissions:**
- Create, edit, and delete any record across the organization
- Invite, manage, and remove all users
- Set targets for any team member
- Access all reports, including revenue, team performance, and audit logs
- View and manage all pipeline, leads, and deals — regardless of assignment
- Lock or unlock contact information on any record
- Access Security Logs

**Visibility:**
- Complete visibility across all data — every lead, deal, meeting, and activity created by any team member

**Management Controls:**
- Full user administration
- System-wide configuration
- Target assignment to all roles
- Access to all audit trails and security logs

---

## Sales Head

**Responsibilities:**
The Sales Head manages the overall sales team's performance. They are responsible for pipeline health, deal reviews, target setting, and performance reporting at the organizational level.

**Permissions:**
- View, edit, and manage all team members' leads, deals, pipeline, and activities
- Lock contact information on leads and deals
- Assign targets to Sales Managers, Sales Employees, and Inside Sales Employees
- Generate and download full team performance reports

**Visibility:**
- Full visibility across all team members' data

**Reporting Access:**
- Revenue reports, pipeline summaries, team leaderboards, DSR for all employees

---

## Sales Manager

**Responsibilities:**
The Sales Manager is responsible for their own sales pipeline as well as supporting and monitoring the Sales Employees and Inside Sales Employees assigned to them.

**Permissions:**
- Create, edit, and manage their own leads, deals, and activities
- View activities and performance data for their direct team
- Assign targets to Sales Employees and Inside Sales Employees
- Run team-level reports for their assigned team

**Team Controls:**
- Can see assigned team members' leads, deals, meetings, and activities

---

## Sales Employee

**Responsibilities:**
The Sales Employee focuses on day-to-day selling activities — making calls, sending emails, attending meetings, and moving leads and deals forward. Their CRM usage is focused entirely on their own assigned records.

**Daily Usage:**
- Create and update leads assigned to them
- Log calls, emails, meetings, notes, and WhatsApp messages as activities
- Schedule and track meetings
- Move deals through the sales pipeline
- Generate their own DSR

---

## Inside Sales Employee

**Responsibilities:**
Inside Sales Employees focus on inbound/outbound calling, email campaigns, and lead qualification from within the office. Their workflow mirrors that of Sales Employees, with the same data access boundaries.

**Daily Usage:**
- Manage their assigned pipeline prospects and leads
- Log activities (calls, emails, follow-ups)
- Update lead stages and temperatures
- Generate their own DSR

---

## Permissions Matrix

| Permission | Super Admin | Sales Head | Sales Manager | Sales Employee | Inside Sales |
|---|:---:|:---:|:---:|:---:|:---:|
| View all team records | Yes | Yes | Partial | No | No |
| Create leads / pipeline | Yes | Yes | Yes | Yes | Yes |
| Edit own records | Yes | Yes | Yes | Yes | Yes |
| Edit any team member's records | Yes | Yes | No | No | No |
| Delete leads / deals | Yes | Yes | No | No | No |
| Bulk import leads | Yes | Yes | Yes | No | No |
| Set targets | Yes | Yes | Yes (limited) | No | No |
| Access Reports | Yes | Yes | Limited | No | No |
| Access Analytics | Yes | Yes | Yes | No | No |
| Access Security Logs | Yes | No | No | No | No |
| Lock contact information | Yes | Yes | No | No | No |
| Manage users | Yes | Partial | No | No | No |
| Edit contact email/phone | Yes | Yes | No | No | No |
| Download DSR (any employee) | Yes | Yes | No | Own only | Own only |
| Access AI Assistant | Yes | Yes | Yes | Yes | Yes |

---

---

# 4. DASHBOARD MODULE

---

## Purpose

The Dashboard is the first screen every user sees when they log in. It is designed to give each user an immediate, personalized snapshot of their current sales status — the most important numbers, the most urgent tasks, and the most recent team activities — all in one view.

## Business Usage

The Dashboard serves as the daily command center for every team member. Sales Employees use it to see their tasks for the day, managers use it to check team performance, and leadership uses it to monitor overall pipeline health.

## KPIs Displayed

- **Total Pipeline Value** – The total monetary value of all active deals in the pipeline
- **Total Leads** – Current count of leads in the system
- **Active Deals** – Count of deals currently in progress
- **Revenue Won (Month-to-Date)** – Total value of deals marked as Won this month
- **Activities Due Today** – Number of tasks and follow-ups due today

## User Insights

The Dashboard greets each user by name with a time-aware message (Good Morning / Good Afternoon / Good Evening) and presents a personalized activity feed showing:

- **Overdue items** – Activities past their due date
- **Today's schedule** – Meetings and tasks due today
- **Upcoming items** – Next 7 days of follow-ups and meetings
- **Recently completed** – Last few activities the user marked done

## Quick Actions

Users can directly create a new lead, log an activity, or schedule a meeting from the Dashboard without navigating to any other module.

## Role-Based Visibility

| User Type | Dashboard Focus |
|---|---|
| Super Admin / Sales Head | Full organization KPIs, team activity feed, pipeline summary |
| Sales Manager | Team-level performance, assigned team's activities |
| Sales Employee / Inside Sales | Personal KPIs, own tasks and meetings for today |

---

## Dashboard Summary Table

| Component | What It Shows |
|---|---|
| KPI Pills | Pipeline value, leads count, active deals, revenue won |
| Activity Strip | Overdue / Today / Upcoming / Meetings tabs |
| Recent Activities | Latest activities by type, company, and due date |
| Team Leaderboard | Manager view — team performance ranking |
| Smart Greeting | Personalized greeting with user name and time of day |

---

---

# 5. LEADS MANAGEMENT MODULE

---

## Purpose

The Leads module is the engine of the sales pipeline. It manages every potential sales contact from the moment they are identified as a qualified lead until they either convert into an active deal or are marked as lost. Every lead has a complete history, a health temperature, a source, and a calculated AI score to help Sales teams prioritize.

## Lead Creation

Leads can be created in three ways:
1. **Manual Entry** – A sales team member fills in the lead form
2. **Bulk CSV Import** – Management imports multiple leads at once from a spreadsheet
3. **Conversion from Pipeline** – A qualified pipeline prospect is formally promoted to a lead

## Lead Assignment

Leads are assigned to specific team members. Super Admins and Sales Heads can assign leads to any user. Sales Managers can assign to their team. Sales Employees and Inside Sales Employees are automatically set as the owner of any lead they create.

## Lead Ownership

Every lead has a clear owner. Only the owner (and senior roles) can update the record. Contact information (email and phone) can only be edited by Sales Head and above — protecting data integrity.

## Lead Lifecycle

```
New → Contacted → Qualified → Proposal → Converted → Won / Lost
```

## Lead Temperature

Every lead is assigned a temperature to indicate engagement level:

| Temperature | Meaning |
|---|---|
| Hot | High engagement; likely to convert soon |
| Warm | Active but not urgent; keep nurturing |
| Cold | Low engagement; needs re-activation |

---

## Lead Fields Table

| Field | Description |
|---|---|
| Company Name | Name of the prospect organization (required) |
| Contact Person | Name of the primary contact at the company |
| Designation | Job title of the contact person |
| Email | Business email address |
| Phone | Phone number with country dial code |
| Industry | Industry sector of the company |
| Country / State / City | Geographic location |
| Company Website | Official company website URL |
| Company LinkedIn | LinkedIn page of the company |
| Personal LinkedIn | LinkedIn profile of the contact person |
| Lead Stage | Current stage in the sales process |
| Lead Temperature | Hot / Warm / Cold |
| Lead Source | Origin of the lead |
| Services of Interest | SAP services being discussed |
| Remarks / Notes | Free-text internal notes |
| Follow-up Date | Scheduled date for next follow-up |
| Assigned To | Team member responsible for the lead |
| AI Score | System-calculated priority score (0–100) |
| Created By | Team member who created the lead |
| Created Date | Date and time lead was created |

---

## Lead Stage Table

| Stage | Meaning | Indicator Color |
|---|---|---|
| New | Lead just created, no contact made yet | Gray |
| Contacted | First contact made with the prospect | Blue |
| Qualified | Prospect confirmed as a valid sales opportunity | Purple |
| Proposal | A formal proposal has been sent or discussed | Amber |
| Converted | Lead has been moved to an active Deal | Green |
| Won | Deal successfully closed | Light Green |
| Lost | Opportunity not pursued or declined | Red |

---

## Lead Source Table

| Source | Description |
|---|---|
| Website | Inquiry received via company website |
| LinkedIn | Connected or engaged via LinkedIn |
| Referral | Referred by an existing client or partner |
| Cold Call | Outbound call made by sales team |
| Email Campaign | Response to an email marketing campaign |
| Event / Conference | Met at an industry event or conference |
| Partner Network | Introduced via a business partner |
| Social Media | Engaged via social media platforms |
| Ads | Responded to paid digital advertising |
| Walk-In | Prospect visited the office directly |
| Others | Any other source (custom text entry) |

---

## Lead Temperature Table

| Temperature | Icon | Meaning |
|---|---|---|
| Hot | Flame (Red) | High interest; needs immediate attention |
| Warm | Thermometer (Orange) | Active interest; regular follow-up needed |
| Cold | Snowflake (Blue) | Low engagement; re-qualification may be needed |

---

## Lead Scoring (AI Score)

Every lead is automatically scored by the system on a 0–100 scale. The score is calculated based on:

| Factor | Points |
|---|---|
| Base score | 40 points |
| Referral source | +25 points |
| Website source | +10 points |
| Deal value > $100K | +30 points |
| Deal value > $50K | +20 points |
| Deal value > $10K | +10 points |
| Lead created within 7 days | +15 points |
| Lead created within 30 days | +10 points |
| Lead created within 90 days | +5 points |
| **Maximum possible score** | **100 points** |

Higher-scoring leads appear with greater visual prominence, helping sales teams prioritize their time on the most promising opportunities.

---

---

# 6. PIPELINE MANAGEMENT MODULE

---

## Purpose

The Pipeline module tracks the very earliest stage of a sales opportunity — before a prospect has been formally qualified as a lead. It serves as a structured holding area for companies and contacts that the sales team is actively exploring but has not yet converted into a formal lead.

## Pipeline Workflow

A prospect enters the Pipeline, moves through outreach and engagement stages, and — once qualified — is converted into a formal Lead. If not qualified, they can be marked as "Not Interested."

## Pipeline Visibility

- Super Admins and Sales Heads can see all pipeline records across the organization
- Sales Managers, Sales Employees, and Inside Sales Employees can only see records assigned to them

## Pipeline Conversion Logic

To convert a Pipeline record to a Lead, the record must have at least one contact method on file — either an email address or a phone number. This ensures that every formal lead has a contactable person attached to it.

---

## Pipeline Flow Table

| Stage | Meaning |
|---|---|
| New Prospect | Identified as a potential prospect; no contact made |
| Attempted Contact | Outreach initiated but no response yet |
| Engaged | Prospect has responded and is in conversation |
| Qualified | Prospect confirmed as a valid opportunity; ready to convert |
| Not Interested | Prospect declined or disqualified |

---

## Pipeline Business Benefits Table

| Benefit | Description |
|---|---|
| Structured early-stage tracking | No prospect falls through the cracks before becoming a lead |
| Clean lead database | Only qualified prospects enter the Leads module |
| Outreach visibility | Managers can see who is being targeted and what stage they are at |
| Conversion clarity | Clear criteria (contact method required) to advance a prospect |
| Historical record | Even rejected prospects remain in the system for future reference |

---

---

# 7. DEALS MANAGEMENT MODULE

---

## Purpose

The Deals module manages all active sales opportunities that have been formally qualified. Every deal has a monetary value, an expected close date, a stage in the sales funnel, and a win probability — giving Sales Managers and Leadership a real-time view of expected revenue and pipeline health.

## Deal Lifecycle

```
New → Contacted → Meeting Scheduled → Proposal Sent → Negotiation → Won / Lost
```

## Deal Views

Deals can be viewed in two formats:
- **Kanban Board** – Visual drag-and-drop columns by stage, showing each deal as a card
- **List View** – Tabular format for filtering, sorting, and bulk scanning

## Deal Health Indicators

The system automatically flags deals by how recently they were updated:

| Health Status | Criteria | Visual Indicator |
|---|---|---|
| Active | Updated within the last 3 days | Green |
| At Risk | Not updated for 3–7 days | Amber |
| Stale | Not updated for more than 7 days | Red |

---

## Deal Stages Table

| Stage | Description | Win Probability |
|---|---|---|
| New | Deal just created | 5% |
| Contacted | Initial contact made | 15% |
| Meeting Scheduled | Meeting booked with prospect | 30% |
| Proposal Sent | Formal proposal submitted | 50% |
| Negotiation | Active negotiation in progress | 70% |
| Won | Deal successfully closed | 100% |
| Lost | Opportunity not won | 0% |

---

## Deal Workflow Table

| Action | Description |
|---|---|
| Create Deal | Manually created or converted from a Lead |
| Update Stage | Drag card to new column (Kanban) or select stage in edit form |
| Mark Won | Closes deal at 100% — optionally creates a Customer record |
| Mark Lost | Requires selection of a loss reason for analysis |
| Lock Record | Sales Head can lock a deal to prevent editing by field users |
| Revert to Lead | Moves deal back to Lead status if needed |
| Revert to Pipeline | Moves deal back to Pipeline if opportunity is not ready |
| Export to CSV | Download deal list as a spreadsheet |

---

## Deal Pipeline Statistics

The Deals module displays the following live statistics at the top of the screen:

| Metric | Description |
|---|---|
| Total Pipeline Value | Sum of all active (non-closed) deal values |
| Weighted Forecast | Pipeline value adjusted by win probability per stage |
| Won Month-to-Date | Total value of deals won in the current month |
| Average Deal Size | Average value across all active deals |
| At-Risk Count | Number of deals flagged as at-risk or stale |

---

---

# 8. ACTIVITIES MANAGEMENT

---

## Purpose

Activities are the core daily actions of a sales professional — every call made, email sent, note recorded, and meeting held is logged as an Activity. The Activities module gives complete visibility into what every team member has done, what they have planned, and what they have missed.

## Activity Logging

Any team member can log an activity at any time, linked to a specific Lead or Deal. Activities include a type, a status, a priority, a due date, and optional notes.

## Activity Types Table

| Type | Description |
|---|---|
| Follow-up Call | Scheduled follow-up by phone |
| Follow-up Email | Scheduled follow-up by email |
| Call | General outbound or inbound call |
| Email | General email communication |
| Meeting (Virtual) | Online video or conference call |
| Meeting (In-Person) | Physical, face-to-face meeting |
| Note | Internal record or observation |
| WhatsApp | WhatsApp message sent or received |

---

## Activity Status Table

| Status | Description |
|---|---|
| Pending (Todo) | Activity is scheduled but not yet started |
| In Progress | Activity is currently being worked on |
| Completed (Done) | Activity has been finished |
| Overdue | Activity was due in the past and is not yet completed |

---

## Activity Priority Table

| Priority | Usage |
|---|---|
| Low | Routine activity, no urgency |
| Medium | Standard follow-up, plan for this week |
| High | Important — should be done today or tomorrow |
| Urgent | Critical — must be done immediately |

---

## Activity Timeline

Activities are grouped intelligently in the timeline view:

| Group | Description |
|---|---|
| Overdue | Past their due date, not yet completed |
| Today | Scheduled for today |
| Tomorrow | Scheduled for tomorrow |
| Upcoming | Next 7 days |
| Later | Beyond the next 7 days |
| Completed | Finished activities, most recent first |

---

---

# 9. MEETING MANAGEMENT

---

## Purpose

The Meetings module provides a structured way to schedule, track, and record the outcome of every customer-facing and internal meeting. Both online and in-person meetings are supported, with calendar views, RSVP management, and outcome logging.

## Meeting Scheduling

Meetings are created with a title, start and end time, attendees, mode (online or in-person), and a purpose. The system supports 15-minute time increments from 7:00 AM to 11:45 PM and fifteen international time zones.

## Online Meetings

For virtual meetings, the system records the platform being used (Google Meet, Zoom, Microsoft Teams, Jitsi, or similar) and stores the meeting link.

## Offline Meetings

For in-person meetings, the system records the physical location with address auto-complete.

## RSVP Process

Attendees (both internal team members and external clients) can be added to meetings, and their RSVP status is tracked within the system.

## Meeting Views

- **Calendar View** – Monthly grid showing all meetings color-coded by status
- **List View** – Card-based grid for quick scanning of all meetings with key details

---

## Meeting Types Table

| Purpose | Description |
|---|---|
| Follow-up | Post-meeting or post-proposal follow-up discussion |
| Discovery Call | Initial call to understand prospect's requirements |
| Product Demo | Demonstration of SAP services or capabilities |
| Negotiation | Commercial negotiation discussion |
| Proposal Discussion | Review of a submitted proposal |
| Requirement Gathering | Deep-dive into client's technical/business requirements |
| Onboarding | Client onboarding and project kick-off |
| Support Meeting | Post-implementation support discussion |
| Internal Discussion | Team or management internal meeting |
| Client Presentation | Formal presentation to client stakeholders |
| Payment Discussion | Billing, invoicing, or payment review |
| Closing Discussion | Final meeting before deal closure |
| Others | Any other meeting type (custom description) |

---

## Meeting Status Table

| Status | Meaning |
|---|---|
| Scheduled | Meeting is booked and upcoming |
| Completed | Meeting took place |
| Cancelled | Meeting was cancelled |
| Rescheduled | Meeting was moved to a new time |

---

## Meeting Outcome Table

| Outcome | Meaning | Indicator |
|---|---|---|
| Won | Resulted in a confirmed sale or agreement | Green Trophy |
| Positive | Good progress made; deal moving forward | Blue Checkmark |
| Neutral | No significant change in deal status | Gray Arrow |
| Negative | Difficult conversation; deal at risk | Red X |
| No Show | Prospect did not attend | Amber Alert |

---

## Meeting Workflow Table

| Step | Action |
|---|---|
| 1 | Schedule meeting — set title, date/time, attendees, mode |
| 2 | Conduct meeting |
| 3 | Log outcome (Won / Positive / Neutral / Negative / No Show) |
| 4 | Add internal notes and follow-up actions |
| 5 | Link meeting to relevant Lead or Deal record |
| 6 | Activity log automatically updated with meeting record |

---

---

# 10. DSR MODULE (DAILY SALES REPORT)

---

## Purpose

The DSR (Daily Sales Report) module automatically calculates and generates structured productivity reports for every sales team member. Instead of manually writing daily reports, team members simply log their activities in the CRM throughout the day, and the system generates a formatted, professional PDF report on demand.

## Reporting Periods

The DSR module supports the following reporting periods:

| Period | Description |
|---|---|
| Daily | One specific day's activity summary |
| Weekly | Seven-day activity and productivity summary |
| Monthly | Full month breakdown with day-by-day chart |
| Quarterly | Three-month summary with weekly breakdown |
| Half-Yearly | Six-month summary |
| Yearly | Full-year summary with monthly breakdown |
| Custom Range | Any user-defined date range |

## DSR Metrics Table

| Metric | What It Measures |
|---|---|
| Total Activities | Number of all activities logged in the period |
| Tasks Completed | Number of activities marked as Done |
| Deals Updated | Number of deal-related activities logged |
| Leads Created | Number of new leads created in the period |
| Productivity Score | Calculated score (0–100) combining all metrics |

---

## Productivity Score Logic

The system calculates a Productivity Score for each team member using the following formula:

| Component | Maximum Contribution | Calculation |
|---|---|---|
| Activities Logged | 40 points | Activity count × 6 (capped at 40) |
| Tasks Completed | 20 points | Completed task count × 6 (capped at 20) |
| Deals Updated | 20 points | Deal activity count × 8 (capped at 20) |
| Leads Created | 20 points | New lead count × 5 (capped at 20) |
| **Total Score** | **100 points** | Sum of all components (capped at 100) |

---

## Score Interpretation

| Score Range | Rating | Visual Indicator |
|---|---|---|
| 70 – 100 | Excellent | Green |
| 40 – 69 | On Track | Amber |
| 0 – 39 | Building | Red |

---

## DSR Workflow

| Step | Who | Action |
|---|---|---|
| 1 | Sales Employee | Logs activities throughout the day (calls, emails, meetings, notes) |
| 2 | System | Automatically captures all activity data |
| 3 | User / Manager | Selects period and employee from DSR module |
| 4 | System | Calculates metrics and productivity score |
| 5 | User / Manager | Downloads PDF report |
| 6 | System | Optionally auto-emails DSR to configured recipients |

---

## DSR Business Benefits

- Eliminates manual daily report writing — saving 15–30 minutes per team member per day
- Provides consistent, structured reporting format for all team members
- Gives Management instant visibility into who is productive and who needs support
- Creates a permanent record of all sales activities for every team member
- Enables comparison of productivity trends over daily, weekly, and monthly periods

---

---

# 11. TARGET MANAGEMENT MODULE

---

## Purpose

The Targets module enables Sales Managers and above to set performance targets for individual team members. Targets give sales professionals a clear goal to work toward and give management a measurable benchmark for performance reviews.

## Target Assignment

Targets can only be assigned downward in the role hierarchy. A Super Admin can set targets for anyone. A Sales Head can set targets for Sales Managers and below. A Sales Manager can set targets for Sales Employees and Inside Sales Employees only. No user can set targets for someone at an equal or higher role.

## Target Visibility

| Role | What They Can See |
|---|---|
| Super Admin | All targets across the organization |
| Sales Head | All targets across the organization |
| Sales Manager | Own targets + targets assigned to their team |
| Sales Employee | Own targets only |
| Inside Sales Employee | Own targets only |

---

## Target Assignment Matrix

| Role | Can Assign Targets To |
|---|---|
| Super Admin | Sales Head, Sales Manager, Sales Employee, Inside Sales |
| Sales Head | Sales Manager, Sales Employee, Inside Sales |
| Sales Manager | Sales Employee, Inside Sales |
| Sales Employee | Cannot assign targets |
| Inside Sales | Cannot assign targets |

---

## Target Rules Table

| Rule | Description |
|---|---|
| Downward only | Targets can only be assigned to lower-ranked roles |
| One owner per target | Each target is assigned to a specific individual |
| Period-based | Targets are set for specific time periods |
| Visible to assignee | The assigned user can see their own target |
| Manager visibility | Managers see all targets for their direct team |

---

---

# 12. REPORTS & ANALYTICS

---

## Purpose

The Reports and Analytics modules give Sales Head and Management a comprehensive view of business performance — from individual team member productivity to organization-wide revenue trends and pipeline health.

## Business Reporting

Reports are available exclusively to Super Admin and Sales Head to ensure sensitive business data is accessed by authorized users only.

## Reports Table

| Report Type | Description |
|---|---|
| Revenue Report | Total revenue won by period, employee, and source |
| Pipeline Snapshot | Current value and stage distribution of all active deals |
| Lead Conversion Funnel | How leads move from New through to Won or Lost |
| Team Productivity Leaderboard | Ranked comparison of team members by activity count |
| DSR Performance Summary | Aggregated productivity scores for all team members |

---

## Analytics Table

| Analytics View | Description |
|---|---|
| Sales Funnel | Breakdown of leads and deals by stage |
| Win Rate % | Percentage of deals that are closed as Won |
| Revenue Trends | Time-series view of revenue over selected periods |
| Team Performance | Side-by-side comparison of team member performance |
| Activity Insights | Count of calls, emails, meetings, and follow-ups by period |
| Conversion Rates | Rate at which pipeline converts to leads, and leads to deals |

---

## Export Options

| Format | Modules |
|---|---|
| PDF | DSR, Revenue Reports, Pipeline Reports, Funnel Analysis |
| CSV | Leads, Deals, Pipeline records |

---

---

# 13. TEAM MANAGEMENT

---

## Purpose

The Team module provides a directory and performance overview of all users in the CRM. Managers and above can see who is on the team, what role they have, and how they are performing.

## User Visibility

Each user profile in the Team module shows:
- Full name and profile photo
- Role and role badge
- Email address
- Performance metrics (activities completed, deals closed, leads created)
- Recent activity feed

## Team Management Summary Table

| Feature | Who Can Use It | Description |
|---|---|---|
| View all team members | Sales Head, Super Admin | Full directory of all users |
| View user performance | Sales Head, Super Admin | Activity counts, deals, and leads per user |
| Invite new users | Super Admin, Sales Head | Send an invitation to a new team member |
| Edit user roles | Super Admin | Change a user's role in the system |
| Remove users | Super Admin | Deactivate or remove a team member |
| View activity feed | Managers and above | See recent activities per user |
| Role badge display | All | Color-coded role badges for visual clarity |

---

---

# 14. AI ASSISTANT (CCENTRIK AI)

---

## Purpose

The CCENTRIK AI Assistant is an intelligent, conversational interface built directly into the CRM. It allows sales team members to ask questions about their pipeline, leads, and performance in plain language — without needing to navigate multiple screens or run reports manually.

## Business Benefits

- Saves time by answering common sales queries instantly
- Helps new team members find information without training
- Provides intelligent recommendations based on CRM data
- Reduces dependence on managers for simple data lookups

---

## AI Capabilities Table

| Capability | Description |
|---|---|
| Lead Insights | Query information about specific leads or lead stages |
| Deal Status Queries | Ask about deal progress, values, and close dates |
| Activity Analysis | Get a summary of recent or upcoming activities |
| Performance Queries | Ask about productivity scores and activity counts |
| Pipeline Queries | Ask about pipeline stage distribution or total values |
| Sales Recommendations | Receive suggestions on next best actions |
| CRM Navigation Help | Get guidance on how to use any CRM feature |

---

---

# 15. EMAIL & COMMUNICATION

---

## Purpose

CCENTRIK CRM includes a fully integrated email system that allows sales team members to send emails directly from within the CRM — without opening an external email client. Every email sent is automatically logged in the communication history of the related Lead, Deal, or Pipeline record.

## Email Sending

Emails are composed in a two-step process:
1. **Confirmation Dialog** – The user confirms the recipient and record being emailed
2. **Composer** – The user writes the subject, body, and sends the email

The email is sent via the team member's connected Gmail account, ensuring all emails come from the individual's business email address.

## Email History

Every email sent from the CRM is stored as a communication record and is visible in:
- The timeline of the related Lead, Deal, or Pipeline record
- The Activities module (as an "Email Sent" activity type)
- The Email Communication Center for a full thread view

## Communication Visibility

Access to email sending is governed by role and ownership rules:

| User Type | Email Access |
|---|---|
| Record Owner | Can always send email from their records |
| Sales Head / Sales Manager | Can send email from any record they have access to |
| Sales Employee / Inside Sales | Can only send email from records assigned to them |

---

## Email Features Table

| Feature | Description |
|---|---|
| In-CRM Composer | Draft and send emails without leaving the CRM |
| Auto-linked History | Every sent email is recorded in the related record's timeline |
| Activity Auto-Creation | Sending an email automatically creates an "Email Sent" activity |
| Gmail Integration | Emails are sent via the user's connected Gmail account |
| Communication Center | Dedicated view showing full email history per record |
| Recipient Lookup | Auto-complete recipient from CRM contacts |
| Multi-surface Access | Available from Pipeline, Lead, and Deal detail panels |

---

---

# 16. INACTIVITY ALERT SYSTEM

---

## Purpose

The Inactivity Alert System monitors all leads and deals in the CRM for periods of inactivity. When a record has not been updated or acted upon within a defined threshold, the system automatically triggers an alert to ensure no opportunity goes cold without management awareness.

## Alert Logic

The system checks leads and deals at scheduled intervals. If a record has not had any activity logged within the configured number of days, an alert is generated and sent to the assigned team member and their manager.

## Management Benefits

- Ensures no lead or deal is forgotten or neglected
- Gives managers early warning before opportunities go cold
- Encourages team members to maintain consistent activity on all records
- Reduces risk of lost deals due to lack of follow-through

---

## Alert Configuration Table

| Setting | Description |
|---|---|
| Inactivity Threshold | Number of days without activity before alert triggers |
| Alert Recipients | Assigned team member + their manager |
| Alert Channel | In-app notification and email alert |
| Alert Scope | Covers both Leads and Deals modules |
| Scheduling | Automated check runs at configured intervals |
| Override | Senior managers can dismiss or acknowledge alerts |

---

---

# 17. SECURITY & AUDIT

---

## Purpose

CCENTRIK CRM includes a comprehensive security and audit framework to ensure data integrity, monitor user actions, and provide Leadership with complete visibility into how the system is being used. All sensitive actions are logged and traceable.

## Login Monitoring

Every login event is recorded, including the user, time, and device. The Super Admin can view a full login history from the Security Logs section.

## Audit Trails

All significant changes to records — including stage changes, assignment changes, temperature updates, and follow-up date updates — are automatically logged with a timestamp and the identity of the user who made the change.

## Contact Information Protection

Lead and Deal contact details (email and phone numbers) can be locked by Sales Heads and above. Once locked:
- Field users cannot view or edit the contact information
- Any attempt to edit locked fields triggers an alert to the assigned manager
- The alert includes the editor's name, role, the field changed, and the old and new values

---

## Security Features Table

| Feature | Description |
|---|---|
| Firebase Authentication | Secure, token-based login for all users |
| Role-Based Access Control | Every user sees only the data their role permits |
| Contact Info Lock | Sales Head can lock phone/email on individual records |
| Sensitive Field Alerts | Email alerts when restricted fields are edited |
| Audit Log | Automatic change tracking on all key fields |
| Login History | Full log of all user login events |
| Bulk Import Tracking | All CSV import events are recorded |
| Data Export Logging | All data export events are recorded |
| Security Logs Module | Owner-only section for reviewing all audit events |

---

---

# 18. END-TO-END BUSINESS FLOW

---

The following table describes the complete end-to-end business process as it flows through CCENTRIK CRM — from the first prospect contact all the way to deal closure and management review.

---

## Complete Business Workflow Table

| Step | Stage | Action | Module | Responsible |
|---|---|---|---|---|
| 1 | **Prospecting** | Identify a potential company or contact; add to Pipeline | Pipeline | Sales Employee / Inside Sales |
| 2 | **Outreach** | Attempt contact via call, email, or LinkedIn; log activity | Pipeline + Activities | Sales Employee |
| 3 | **Engagement** | Prospect responds; update Pipeline stage to Engaged | Pipeline | Sales Employee |
| 4 | **Qualification** | Confirm budget, authority, need, and timeline; update to Qualified | Pipeline | Sales Employee / Sales Manager |
| 5 | **Lead Conversion** | Convert qualified prospect to a formal Lead in the Leads module | Pipeline → Leads | Sales Employee / Manager |
| 6 | **Lead Nurturing** | Continue calling, emailing, sending follow-ups; log all activities | Leads + Activities | Sales Employee |
| 7 | **Meeting Scheduling** | Schedule a Discovery or Demo meeting; send invite to prospect | Meetings | Sales Employee |
| 8 | **Meeting Conducted** | Hold meeting; log outcome (Positive / Won / Neutral etc.) | Meetings | Sales Employee |
| 9 | **Proposal Stage** | Send formal proposal; update Lead to Proposal stage | Leads | Sales Employee |
| 10 | **Deal Creation** | Convert Lead to a Deal; set deal value and expected close date | Leads → Deals | Sales Employee / Manager |
| 11 | **Deal Progression** | Move deal through negotiation; log all activities and meetings | Deals + Activities | Sales Employee |
| 12 | **Deal Closure** | Mark deal as Won or Lost; log loss reason if applicable | Deals | Sales Employee |
| 13 | **Customer Creation** | Optionally convert Won deal to a Customer record | Deals | Sales Employee |
| 14 | **Daily Reporting** | System auto-compiles activities into a DSR for the day | DSR | Automatic |
| 15 | **Management Review** | Manager reviews DSR, productivity score, and team pipeline | DSR + Reports + Dashboard | Sales Manager / Sales Head |
| 16 | **Target Monitoring** | Leadership compares actual performance against set targets | Targets + Reports | Sales Head / Super Admin |
| 17 | **Performance Analysis** | Run monthly/quarterly analytics to identify trends | Analytics + Reports | Sales Head / Super Admin |

---

---

# 19. PHASE 1 SUMMARY

---

## Overview

Phase 1 of CCENTRIK CRM represents the complete foundation of an enterprise-grade sales management platform. All core modules have been built, tested, and deployed. The platform is live, operational, and actively being used by the Ccentrik sales team.

---

## Completed Functional Areas

| # | Module | Status |
|---|---|---|
| 1 | Dashboard | Complete |
| 2 | Pipeline Management | Complete |
| 3 | Leads Management | Complete |
| 4 | Deals Management | Complete |
| 5 | Activities Management | Complete |
| 6 | Meetings Management | Complete |
| 7 | Daily Sales Reports (DSR) | Complete |
| 8 | Target Management | Complete |
| 9 | Reports & Analytics | Complete |
| 10 | Team Management | Complete |
| 11 | AI Assistant | Complete |
| 12 | Email & Communication | Complete |
| 13 | Inactivity Alert System | Complete |
| 14 | Security & Audit Framework | Complete |
| 15 | Role-Based Access Control | Complete |

---

## Business Benefits Delivered

| Benefit Area | Description |
|---|---|
| **Sales Productivity** | All daily activities, meetings, calls, and emails are logged in one place — no duplication, no missed follow-ups |
| **Pipeline Visibility** | End-to-end view of every opportunity from first prospect contact to deal closure |
| **Management Reporting** | Automated DSR and analytics eliminate manual report preparation |
| **Data Integrity** | Role-based access, contact locking, and audit trails protect sensitive information |
| **Accountability** | Every action is logged, timestamped, and attributed to the responsible team member |
| **Lead Prioritization** | AI scoring ensures sales team focuses time on the highest-value opportunities |
| **Communication History** | Every email, call, meeting, and note is recorded and accessible in the relevant record |
| **Performance Measurement** | Productivity scores and target tracking give clear, objective performance benchmarks |

---

## Phase 1 Completion Summary Table

| Category | Metric |
|---|---|
| Total Functional Modules | 15 |
| User Roles Supported | 5 |
| Lead Stages | 7 |
| Pipeline Stages | 5 |
| Deal Stages with Win Probability | 7 |
| Activity Types | 8 |
| Meeting Purpose Types | 13 |
| DSR Reporting Periods | 7 |
| Lead Sources Tracked | 11 |
| Industries Covered | 11 |
| SAP Services Tracked | 5 (+ custom) |
| Export Formats | CSV + PDF |
| AI Score Range | 0 – 100 |
| Productivity Score Range | 0 – 100 |
| Platform Availability | Web (Desktop & Mobile Browser) |

---

---

*Document End — CCENTRIK CRM Phase 1 Documentation v1.0 — June 2026*

---
