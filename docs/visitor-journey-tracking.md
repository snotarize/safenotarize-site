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

## Reading the reports

In GA4, use Realtime to spot recent public page views/events and the Pages and screens report for page totals. In Explore, use Path exploration to follow recorded pages/events and Funnel exploration to compare service selection, checkout and intake submission. Break down supported reports by country, device and session source/medium. Processed reports can lag behind Realtime.

For custom parameter breakdowns, an Analytics editor can register event-scoped custom dimensions for `cta_target`, `booking_route`, `booking_step` and `document_choice`. Those definitions are an account setting, separate from this website deployment. Basic event counts and page reports do not require them.

tawk.to live visitors are available from the pulse/activity icon > Visitors. For a stored chat, open Dashboard > History > the visitor > Timeline to see recorded page activity and source/device details; Transcript shows the conversation. Not every visitor notification identifies a unique person, paying customer or paid ad click. Location is an IP estimate. A last recorded page/activity is not a guaranteed timestamp of closing the browser.

Only data collected from deployment onward can describe the newly covered pages. The tracker cannot reconstruct historical visits, identify anonymous people's real names, capture all opted-out/ad-blocked visits or establish a visitor's reason for leaving.

## Validation

Run `node --test site-tests/*.test.mjs`. The suite checks public coverage, sensitive-page exclusions, event allowlists, duplicate prevention, attribution/order proof behavior and existing English/Haitian Creole booking/document paths. No live booking, customer email, notary session or test purchase is needed for these checks.
