# SafeNotarize visitor journey tracking

## Coverage

The shared GA4 tracker is installed on all 97 public sitemap pages plus the five public start/booking pages (102 HTML pages). Acquisition attribution loads after Analytics. Existing official-form organic journeys and the Ketterle vehicle-release referral keep ownership of their landing-page view, preventing duplicate page views. Direct and paid visits to those pages use the shared tracker.

Private receipts, uploads, document editors, customer documents and embedded frames are excluded. Global Privacy Control and Do Not Track are respected. Form values, document contents, email addresses, access tokens, order references and arbitrary destination URLs are not sent to GA4. Public URLs are sanitized before tag configuration.

## Events

| Event | Meaning | Allowed extra fields |
| --- | --- | --- |
| `page_view` | A tracked public page opened | Clean public URL and referrer origin |
| `notarization_cta_click` | A link to start, booking, library or editor was clicked | `cta_target` fixed category |
| `notarization_service_selected` | Standard or On-Demand selected | `booking_route` |
| `notarization_document_choice` | Existing document or template selected | `booking_route`, `document_choice` |
| `begin_checkout` | Booking/checkout form became available | `booking_route` |
| `notarization_booking_step` | A booking step was displayed | `booking_route`, `booking_step` |
| `notarization_intake_submitted` | Booking code accepted an order reference from a successful intake response | `booking_route` |
| `purchase` | A separate server reporter verified a completed, paid order and final amount | Existing server reporting contract |

Repeated service, CTA, checkout and intake callbacks are deduplicated within each page load. A booking or card authorization is not a paid purchase. No new event was made a Google Ads primary conversion by this release.

## Individual visitor timelines

The shared public-page loader also connects the allowlisted steps to the existing tawk.to property. In tawk.to, open **Active > Visitors**, select a visitor, then inspect **Session Information > Timeline**. For a saved conversation, open the visitor in Inbox and choose Session Information > Timeline. The `sn-visit` attribute and each event's `visit` metadata link public activity within the same browser tab. Each event includes its original timestamp, public page, last recorded step and a sequence ID. Pending events may arrive after navigation, so use the `at` field for the original time rather than assuming arrival order is exact. No new chat message or customer booking is created by this instrumentation.

The optional **Having trouble?** link on start and booking pages lets a visitor explicitly select a reason. It does not interrupt checkout, default to a reason, capture free text or force a response. Confirmation appears only when tawk.to acknowledges the event.

Evidence has three distinct labels:

| Label | Meaning |
| --- | --- |
| `activity-only` | A public page or booking step was recorded. `sn-page-hidden` means the page was backgrounded or left, not that the visitor abandoned. |
| `technical-observation` | A fixed error category was observed, such as failed card authorization, unavailable checkout, failed intake request, browser offline or form validation. This does not prove the error caused the visitor to leave. |
| `visitor-reported` | The visitor actively selected a feedback reason. This is the only personal explanation labeled as reported by the visitor. |

There is no inferred "confirmed reason" for a visitor who gives no feedback. An intake reference, payment hold, or visible Join button is not a completed paid purchase. Payment success remains owned by the existing verified server reporting.

Tawk.to is reused rather than adding a recording vendor or backend. On newly covered pages the widget stays hidden; the existing marketing-page widget behavior is preserved. Timelines are best effort: blocked scripts, missing consent, expired widget sessions, privacy controls, private URLs, disabled storage and abrupt browser closure can leave gaps. This does not create screen recordings or recover historical individual visits. Anonymous IDs are per browser tab and refresh on a new page after a 30-minute inactive period. Tawk.to's own visitor/session lifetime may differ.

No document editor, upload, receipt, private resume link, form contents, payment-card details, arbitrary error message or stack trace enters the new events. The queue is bounded and revalidated after storage. The measurement respects Global Privacy Control and Do Not Track. Only known public query parameters are accepted before starting the widget. Event delivery failures never block the underlying booking.

The widget script uses `strict-origin-when-cross-origin`, as required by tawk.to's widget guidance, so its request receives the public origin without a page path or query. tawk.to intentionally restricts bots/crawlers. Automated-browser delivery can therefore remain unverified even when the published UI and local acknowledgement tests pass; do not treat a local SDK stub as proof of live receipt.

## Reading the reports

In GA4, use Realtime to spot recent public page views/events and the Pages and screens report for page totals. In Explore, use Path exploration to follow recorded pages/events and Funnel exploration to compare service selection, checkout and intake submission. Break down supported reports by country, device and session source/medium. Processed reports can lag behind Realtime.

For custom parameter breakdowns, an Analytics editor can register event-scoped custom dimensions for `cta_target`, `booking_route`, `booking_step` and `document_choice`. Those definitions are an account setting, separate from this website deployment. Basic event counts and page reports do not require them.

tawk.to live visitors are available from the pulse/activity icon > Visitors. For a stored chat, open Dashboard > History > the visitor > Timeline to see recorded page activity and source/device details; Transcript shows the conversation. Not every visitor notification identifies a unique person, paying customer or paid ad click. Location is an IP estimate. A last recorded page/activity is not a guaranteed timestamp of closing the browser.

Only data collected from deployment onward can describe the newly covered pages. The tracker cannot reconstruct historical visits, identify anonymous people's real names, capture all opted-out/ad-blocked visits or establish a visitor's reason for leaving.

## Validation

Run `node --test site-tests/*.test.mjs`. The suite checks public coverage, sensitive-page exclusions, event allowlists, duplicate prevention, attribution/order proof behavior and existing English/Haitian Creole booking/document paths. No live booking, customer email, notary session or test purchase is needed for these checks.
