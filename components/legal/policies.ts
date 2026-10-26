export type PolicySection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type PolicyDocument = {
  title: string;
  label: string;
  introduction: string;
  sections: PolicySection[];
};

export const policyDocuments: Record<string, PolicyDocument> = {
  guidelines: {
    title: "Community Guidelines",
    label: "Trust and safety",
    introduction:
      "Agoré puts people first and conversation at the center. These guidelines explain how members are expected to treat one another and how to report behaviour that makes participation unsafe.",
    sections: [
      {
        heading: "1. Treat people with respect",
        paragraphs: [
          "People can disagree, debate ideas, criticise public statements, and share different perspectives. Disagreement does not justify targeted abuse.",
          "Do not threaten, stalk, intimidate, repeatedly target, or encourage others to harass a person. Do not organise dogpiling or use coordinated behaviour to silence or intimidate someone.",
        ],
      },
      {
        heading: "2. Hate and threats are not acceptable",
        paragraphs: [
          "Do not use Agoré to promote violence, threaten people, or demean or dehumanise people because of characteristics such as race, ethnicity, nationality, religion, disability, sex, sexual orientation, or gender identity.",
          "Criticism of beliefs, institutions, public policies, or conduct is different from attacking people because of who they are. Context matters, but threats and targeted hateful abuse are not protected by framing them as debate.",
        ],
      },
      {
        heading: "3. Protect privacy and consent",
        paragraphs: [
          "Do not publish another person's private information without permission or a legitimate lawful basis. This includes home addresses, private contact information, credentials, financial information, sensitive documents, and information that could expose someone to harm.",
          "Do not share intimate images, sexual material, private messages, or recordings in a way that violates consent, privacy, or applicable law. Do not impersonate someone to obtain private information or access.",
          "Do not attempt to access another person's account, bypass privacy settings, or expose confidential information obtained through a security weakness.",
        ],
      },
      {
        heading: "4. Sexual exploitation and harm",
        paragraphs: [
          "Sexual exploitation, coercion, non-consensual intimate content, grooming, and the sexual exploitation of minors are prohibited. Child sexual abuse material must never be uploaded, requested, distributed, or promoted.",
          "Do not use Agoré to promote human trafficking, credible violence, or activities intended to cause serious physical harm.",
        ],
      },
      {
        heading: "5. Be authentic",
        paragraphs: [
          "Do not impersonate another person, organisation, or public authority in a misleading way. Parody and clearly disclosed fan or commentary accounts must not be used to commit fraud or deceive people about identity or authority.",
          "Do not run scams, phishing campaigns, malicious links, fake giveaways, fraudulent fundraising, or deceptive schemes intended to steal money, credentials, personal information, or access.",
        ],
      },
      {
        heading: "6. No spam or platform manipulation",
        paragraphs: [
          "Do not flood feeds, replies, messages, groups, or reports with repetitive or unsolicited material. Do not use automation, fake accounts, engagement manipulation, or coordinated inauthentic activity to distort conversations or evade restrictions.",
          "Do not interfere with service availability, abuse reporting systems, attempt unauthorised access, or probe systems beyond the permission granted to you.",
        ],
      },
      {
        heading: "7. Respect rights and the law",
        paragraphs: [
          "Only upload content you have the right to share. Do not use Agoré to distribute unlawful material, infringe intellectual-property rights, or encourage people to commit crimes.",
          "A claim that content is lawful in one location does not guarantee that it can be shared everywhere. Agoré may restrict content where reasonably necessary to address safety, rights, or legal concerns.",
        ],
      },
      {
        heading: "8. Use reporting tools responsibly",
        paragraphs: [
          "Use the reporting features available in Agoré to raise concerns about posts, accounts, or other behaviour. When possible, identify the relevant account or content and describe the issue clearly.",
          "Do not submit knowingly false, retaliatory, or coordinated abusive reports. Do not use reports as a way to intimidate people whose opinions you dislike.",
          "If you believe your account or content is being targeted, use the available report or support channel and provide relevant information without including passwords or authentication tokens.",
        ],
      },
      {
        heading: "9. Enforcement and review",
        paragraphs: [
          "Agoré may review reports and other available information to assess possible violations. Depending on severity, context, history, and risk, actions may include removing content, limiting a feature, restricting an account, suspending access, or terminating an account.",
          "Agoré may act to prevent imminent harm or comply with applicable law. We will not promise a fixed response time for every report, and some actions may be taken without advance notice where necessary to protect users or the service.",
          "If you believe an enforcement decision was made in error, contact agore.support@gmail.com with the subject line “Agoré Moderation Review”. Include the affected account and decision where known. A review request does not guarantee reversal or a specific response time.",
        ],
      },
      {
        heading: "10. Where these guidelines apply",
        paragraphs: [
          "These guidelines apply to use of Agoré, including profiles, posts, replies, reactions, reposts, private messages, groups, notifications, and reporting or support interactions.",
          "Some controls or enforcement capabilities may still be developing. The existence of a reporting or blocking feature does not guarantee that all harmful behaviour can be prevented.",
        ],
      },
      {
        heading: "11. Contact",
        paragraphs: [
          "For urgent account safety concerns, suspected exploitation, or a question about these guidelines, contact agore.support@gmail.com. Do not send passwords, session tokens, or unrelated sensitive information.",
        ],
      },
    ],
  },

  terms: {
    title: "Terms of Service",
    label: "Using Agoré",
    introduction:
      "These Terms of Service describe the rules for using Agoré. Agoré is an early-stage social platform, and some features or procedures may change as the service develops.",
    sections: [
      {
        heading: "1. Agreement to these terms",
        paragraphs: [
          "By creating an account or using Agoré, you agree to these Terms of Service and the Community Guidelines. The Privacy Policy explains how information is handled.",
          "If you do not agree to these terms, do not create an account or continue using the service.",
        ],
      },
      {
        heading: "2. Eligibility",
        paragraphs: [
          "For the current beta, Agoré is intended for adults aged 18 or older. You must confirm this when signing up and must not create or use an account if you are under 18.",
          "You must also be legally permitted to use the service in your location. This minimum-age policy is a current product restriction, not a statement that one age rule satisfies every law worldwide.",
        ],
      },
      {
        heading: "3. Your account",
        paragraphs: [
          "You are responsible for the accuracy of the information you provide, keeping your login credentials secure, and activity conducted through your account to the extent permitted by applicable law.",
          "Do not impersonate another person, share access in a way that undermines account security, circumvent account restrictions, or use another person's credentials without permission.",
          "If you believe your account has been compromised, contact Agoré Support promptly.",
        ],
      },
      {
        heading: "4. Your content",
        paragraphs: [
          "You retain rights you already hold in content you create and share. You are responsible for making sure you have the rights and permissions needed to upload, publish, or send that content.",
          "When you submit content to Agoré, you grant Agoré a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, process, display, transmit, and distribute that content only as reasonably necessary to operate, secure, provide, and improve the service and its features.",
          "This licence is limited to service operation. It does not transfer ownership of your content to Agoré. It may continue for a limited time in backups, technical records, or copies necessary for legal compliance and service integrity after content is removed.",
        ],
      },
      {
        heading: "5. Public and private sharing",
        paragraphs: [
          "Content shared through public features may be visible to other users and may be copied, captured, or redistributed by them. Consider your audience before posting.",
          "Private conversations are intended for their authorised participants. Do not assume that any online service can guarantee absolute confidentiality or prevent a participant from copying or disclosing a message.",
          "Agoré applies access controls according to how a feature is designed, but no online system is immune from security incidents or technical failure.",
        ],
      },
      {
        heading: "6. Acceptable use",
        paragraphs: [
          "You must follow the Community Guidelines and applicable law. Prohibited activity includes harassment, threats, hateful abuse, exploitation, non-consensual intimate content, fraud, impersonation, spam, unauthorised access, privacy violations, and intellectual-property infringement.",
          "Do not misuse the service to interfere with systems, evade enforcement, distribute malware, or collect information about other users without authorisation.",
        ],
      },
      {
        heading: "7. Safety reports and enforcement",
        paragraphs: [
          "Agoré may investigate reports, remove content, restrict features, suspend accounts, or terminate access when reasonably necessary to enforce these terms, protect users, secure the service, or comply with law.",
          "The action taken depends on the circumstances. Agoré may take urgent action without advance notice when necessary to reduce a serious risk. Where appropriate, you may request a review through agore.support@gmail.com using the subject line “Agoré Moderation Review”.",
        ],
      },
      {
        heading: "8. Changes and availability",
        paragraphs: [
          "Agoré is provided on an evolving basis. Features may be added, changed, paused, or discontinued. We do not guarantee uninterrupted availability, error-free operation, or that every feature will remain available.",
          "We may update these terms to reflect changes to the service, safety requirements, or applicable law. The published page will show the latest review date. Where required, we will provide notice or obtain consent before a material change takes effect.",
        ],
      },
      {
        heading: "9. Third-party services",
        paragraphs: [
          "Agoré relies on third-party infrastructure and may integrate external authentication, hosting, storage, or notification services. Those services may be subject to their own terms and privacy practices.",
          "Agoré is not responsible for services it does not operate, subject to rights and obligations that cannot be excluded under applicable law.",
        ],
      },
      {
        heading: "10. Disclaimers and liability",
        paragraphs: [
          "To the extent permitted by law, Agoré is provided on an “as available” basis, without a guarantee that the service will meet every user's requirements or remain available at all times.",
          "Nothing in these terms excludes or limits liability, consumer rights, or remedies that cannot lawfully be excluded or limited. Any limitation of liability applies only to the extent permitted by the law applicable to the claim.",
        ],
      },
      {
        heading: "11. Suspension and termination",
        paragraphs: [
          "You may stop using Agoré at any time. For help with account closure or deletion, contact agore.support@gmail.com with the subject line “Agoré Account Deletion Request”.",
          "Agoré may restrict or terminate access as described in these terms and the Community Guidelines. Some records may be retained where necessary for security, legal compliance, dispute resolution, or backup operations, as described in the Privacy Policy.",
        ],
      },
      {
        heading: "12. Contact",
        paragraphs: [
          "Questions about these terms can be sent to agore.support@gmail.com. Use a clear subject line and do not include passwords, authentication tokens, or unnecessary sensitive information.",
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy Policy",
    label: "Your information",
    introduction:
      "This Privacy Policy explains what Agoré processes when you use the service, why it is processed, which providers support the service, and the choices available to you. Agoré is an early-stage service and some operational details remain subject to verification.",
    sections: [
      {
        heading: "1. Who operates Agoré and how to contact us",
        paragraphs: [
          "Agoré is currently operated by the team responsible for the Agoré project. For privacy questions, access or correction requests, deletion requests, or other privacy concerns, email agore.support@gmail.com with the subject line “Agoré Privacy Request”.",
          "The operator's formal legal identity and required business contact details must be confirmed before broad public launch. This notice must be updated if applicable law requires additional identity or address information.",
        ],
      },
      {
        heading: "2. Information we process",
        paragraphs: [
          "The information processed depends on which features you use, the information you provide, and the configuration of the service.",
        ],
        bullets: [
          "Account and authentication information, such as email address, username, display name, account identifiers, sign-in provider information, session information, and account status.",
          "Signup agreement records, including the policy versions acknowledged, age self-attestation, signup method, and issue and recording timestamps. These records are stored in account authentication metadata.",
          "Profile information you provide, such as an avatar, biography, profile links, or optional location details.",
          "Content and activity, such as posts, images, replies, reactions, reposts, follows, blocks, messages, group membership, attachments, and timestamps associated with activity.",
          "Reports and support information, including what you submit, relevant account or content identifiers, messages with support, and case status or assignment information.",
          "Security and technical information generated when the service is used, including request information, error and diagnostic records, rate-limit events, and hosting or infrastructure logs.",
          "Optional analytics information, if you accept analytics: a generated visitor identifier stored in local browser storage, a session identifier, the page path, the referring website's hostname, device category, a page-view event identifier, and a country code derived from hosting request metadata. The application may associate a page-view event with the signed-in account identifier.",
          "Vercel Web Analytics data, when optional analytics is accepted, such as page views, route information, referrer information, and aggregated visitor or device metrics.",
        ],
      },
      {
        heading: "3. How we use information",
        paragraphs: [
          "Agoré uses information to create and secure accounts, provide profiles and social features, deliver messages and notifications, store and display content, maintain settings, handle reports and support requests, investigate abuse, protect the service, troubleshoot errors, and comply with applicable law.",
          "Optional analytics is used to understand site usage and improve the reliability and usability of the service. The app's optional page-view analytics and Vercel Web Analytics are gated behind the analytics choice described below.",
        ],
      },
      {
        heading: "4. Analytics choices and browser storage",
        paragraphs: [
          "Agoré provides a privacy and analytics control that lets you accept or reject optional analytics. If you reject, the app suppresses its optional page-view tracking and Vercel Analytics events. You can reopen the controls using the “Privacy & analytics settings” button and change your choice.",
          "If you accept, the app may store a generated visitor identifier in local storage and a session identifier and referring-host information in session storage. These identifiers are used for page-view analytics and are not required to sign in or use the core social features.",
          "Necessary authentication and application storage may still be used when required for the service to function. Rejecting optional analytics does not disable necessary session mechanisms. Vercel and other infrastructure providers may also process technical information as part of delivering and securing the service.",
          "The analytics control records your current choice in this browser. It is not an account-wide preference and may need to be set again in another browser or after browser storage is cleared.",
        ],
      },
      {
        heading: "5. Content visibility and communications",
        paragraphs: [
          "Information shared through public-facing features may be seen by other users according to the feature's access controls. Other users may save, screenshot, or redistribute information they can access.",
          "Private conversations are intended for their authorised participants. Relevant information may also be processed to deliver the feature, secure the service, address a user-submitted report, provide requested support, comply with law, or investigate a serious safety issue, subject to applicable access controls and legal requirements.",
          "Information provided in a report or support request may be reviewed by authorised people responsible for handling that request.",
        ],
      },
      {
        heading: "6. Service providers and disclosures",
        paragraphs: [
          "Agoré relies on providers to operate the service. Depending on the feature, these may include Supabase for authentication, database and related backend services; Vercel for hosting, deployment and Web Analytics; Google when Google sign-in is used; and browser or push infrastructure when web-push notifications are enabled.",
          "The Agoré Supabase database project is configured in London, United Kingdom (eu-west-2). This identifies the database region only; it does not establish where Supabase authentication and ancillary services, Vercel hosting and logs, Google sign-in, push infrastructure, or other providers process or store information. Those provider configurations, data-processing terms, and applicable international-transfer safeguards must be verified before broad public launch.",
          "Agoré does not currently operate a behavioural-advertising programme or intentionally sell personal information as a standalone product. This statement must be revisited if the product's commercial or data-sharing practices change.",
          "Information may also be disclosed where required by law or where reasonably necessary to respond to valid legal process, protect users, investigate a serious security incident, establish or defend legal claims, or protect the rights and safety of people or the service.",
        ],
      },
      {
        heading: "7. Retention",
        paragraphs: [
          "Agoré retains information for as long as reasonably necessary to provide the service, maintain security, resolve reports and disputes, meet applicable legal obligations, and maintain required operational records.",
          "Analytics page-view records are subject to a scheduled daily database cleanup configured to delete records from the agore_analytics_pageviews dataset when they are older than 180 days. The cleanup job is configured and verified as active. This rule applies only to that analytics dataset and does not establish retention periods for account data, posts, messages, reports, support cases, authentication or provider logs, consent-history metadata, or backups.",
          "Information may remain in backups for a limited period after a deletion request, or be retained where permitted or required for security, legal compliance, or dispute resolution.",
          "Agoré must document and periodically review retention criteria for the remaining categories of information before broad public launch.",
        ],
      },
      {
        heading: "8. Your choices and privacy rights",
        paragraphs: [
          "Depending on your location and the law that applies, you may have rights to request access to, correction of, deletion of, restriction of, or objection to certain processing of your personal information. You may also have a right to data portability or to complain to a data-protection authority.",
          "To make a request, email agore.support@gmail.com with the subject line “Agoré Privacy Request”. Identify the request and account as clearly as you can. We may ask for reasonable information to verify that the request relates to your account.",
          "Agoré will assess and respond to requests within the time required by applicable law. Rights are subject to lawful exceptions and may differ by jurisdiction.",
          "Users in Nigeria may also contact the Nigeria Data Protection Commission. Other users may have a right to contact the data-protection authority for their jurisdiction.",
        ],
      },
      {
        heading: "9. Age and children's information",
        paragraphs: [
          "The current beta is intended for adults aged 18 or older. The signup flow asks users to confirm that they meet this requirement; it does not currently ask for a full date of birth.",
          "A signup attestation is not high-assurance age verification. Agoré must review the age-assurance and consent measures needed under the laws applicable to its users before broad public launch. If you believe an account belongs to someone under 18, contact agore.support@gmail.com so the matter can be reviewed.",
        ],
      },
      {
        heading: "10. Security",
        paragraphs: [
          "Agoré uses technical and organisational controls intended to protect information, including authentication, server-side authorisation, database access controls, input validation, rate limiting, and restricted access to privileged operations.",
          "No online service can guarantee absolute security. Protect your credentials and contact Agoré promptly if you suspect that your account or information has been compromised.",
        ],
      },
      {
        heading: "11. International processing",
        paragraphs: [
          "Agoré is designed for a global audience and relies on providers that may process information in countries other than your own. The relevant locations and safeguards depend on the configured regions and provider agreements.",
          "The Agoré Supabase database project is configured in London, United Kingdom (eu-west-2). This is the database region only and should not be read as a statement that all providers or processing remain within the United Kingdom. Hosting, authentication, logs, backups, push delivery, and other provider locations and applicable international-transfer safeguards still need to be verified and disclosed before broad public launch.",
        ],
      },
      {
        heading: "12. Changes to this policy",
        paragraphs: [
          "This policy may be updated to reflect changes to the service, technology, legal requirements, or information practices. The page will display the latest update date. Where required, Agoré will provide notice or obtain consent before a material change takes effect.",
        ],
      },
      {
        heading: "13. Contact",
        paragraphs: [
          "For privacy requests and privacy questions, email agore.support@gmail.com with the subject line “Agoré Privacy Request”. For ordinary account help or product feedback, contact the same address with a clear description of the issue.",
        ],
      },
    ],
  },
};