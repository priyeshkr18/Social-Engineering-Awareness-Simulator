/* ============================================================
	 PERIMETER — Social Engineering Awareness Simulator
	 Vanilla JS application logic. No frameworks, no backend,
	 no localStorage — all state lives in memory for this session.
	 ============================================================ */
(function () {
	"use strict";

	/* ------------------------------------------------------------
		 0. SMALL UTILITIES
		 ------------------------------------------------------------ */
	const qs = (sel, el = document) => el.querySelector(sel);
	const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
	const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };
	function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
	function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

	let toastTimer = null;
	function showToast(msg, icon) {
		const t = qs('#toast');
		t.innerHTML = `<span>${icon || '✅'}</span><span>${esc(msg)}</span>`;
		t.classList.add('show');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
	}

	function playTone(freq, dur) {
		if (!STATE.settings.sound) return;
		try {
			const ctx = playTone._ctx || (playTone._ctx = new (window.AudioContext || window.webkitAudioContext)());
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'sine';
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0.06, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
			osc.connect(gain).connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + dur);
		} catch (e) { /* audio not available, fail silently */ }
	}

	/* ------------------------------------------------------------
		 1. APPLICATION STATE (in-memory only)
		 ------------------------------------------------------------ */
	const STATE = {
		xp: 0,
		streak: 0,
		bestStreak: 0,
		moduleResults: {},     // id -> {correct, total, done:true}
		totalAnswered: 0,
		totalCorrect: 0,
		accuracyHistory: [],   // [{label, pct}]
		quizAttempts: [],      // [{pct, grade}]
		settings: { theme: 'dark', sound: true, anim: true },
		badgesEarned: new Set(),
	};

	function xpForLevel(xp) { return Math.floor(xp / 120) + 1; }

	function addXP(amount) {
		STATE.xp += amount;
		qs('#nav-xp').textContent = STATE.xp;
		qs('#nav-level').textContent = xpForLevel(STATE.xp);
		checkBadges();
	}

	function registerAnswer(moduleId, correct) {
		STATE.totalAnswered++;
		if (correct) {
			STATE.totalCorrect++;
			STATE.streak++;
			STATE.bestStreak = Math.max(STATE.bestStreak, STATE.streak);
			addXP(10);
			playTone(880, 0.15);
		} else {
			STATE.streak = 0;
			playTone(160, 0.22);
		}
		qs('#nav-streak').textContent = STATE.streak;
		checkBadges();
	}

	/* ------------------------------------------------------------
		 2. QR PLACEHOLDER GENERATOR (decorative, non-scannable)
		 ------------------------------------------------------------ */
	function makeFakeQR(seedStr, size = 160) {
		let seed = 0;
		for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
		function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
		const cells = 12, cell = size / cells;
		let rects = '';
		for (let y = 0; y < cells; y++) {
			for (let x = 0; x < cells; x++) {
				const isFinder = (x < 3 && y < 3) || (x > cells - 4 && y < 3) || (x < 3 && y > cells - 4);
				const on = isFinder ? ((x + y) % 2 === 0 || (x > 0 && x < 2 && y > 0 && y < 2) || (x > cells - 3 && x < cells - 1 && y > 0 && y < 2) || (x > 0 && x < 2 && y > cells - 3 && y < cells - 1)) : rnd() > 0.55;
				if (on) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="var(--text)"/>`;
			}
		}
		return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="background:#fff;border-radius:12px;padding:10px">${rects}</svg>`;
	}

	/* ------------------------------------------------------------
		 3. MODULE DATA — 20 attack simulators
		 Each scenario: { type, question, options:[{text,correct}], explanation, redFlags }
		 plus type-specific display fields.
		 ------------------------------------------------------------ */
	const MODULES = [
		{
			id: 'phishing', name: 'Phishing Email Simulator', icon: '✉️', difficulty: 'Easy', risk: 'High',
			desc: 'Sort a fake inbox and spot the clues that separate phishing from legitimate mail.',
			scenarios: [
				{
					type: 'email', from: 'security-alerts@paypa1-support.com', to: 'you@example.com',
					subject: '⚠ Your account will be suspended in 24 hours',
					body: "Dear Valued Customer,\n\nWe detected unusual sign-in activity on your account. Failure to verify your identity within 24 hours will result in permanent suspension.\n\nVerify now: http://paypa1-support-verify.com/login\n\nThank you,\nAccount Security Team",
					question: 'Is this email a phishing attempt or legitimate?',
					options: [{ text: 'Phishing attempt', correct: true }, { text: 'Legitimate email', correct: false }],
					explanation: 'The domain uses a "1" instead of an "l" (paypa1), the greeting is generic, and there is manufactured urgency pushing you to a lookalike link instead of the real site.',
					redFlags: ['Lookalike domain (paypa1 vs paypal)', 'Generic "Valued Customer" greeting', 'Artificial 24-hour deadline', 'Mismatched/suspicious link']
				},
				{
					type: 'email', from: 'notifications@github.com', to: 'you@example.com',
					subject: '[GitHub] New sign-in to your account',
					body: "Hi there,\n\nWe noticed a new sign-in to your account from Chrome on macOS in Ludhiana, India.\n\nIf this was you, no action is needed. If you don't recognize this activity, please review your account security settings from your GitHub dashboard.\n\n— The GitHub Team",
					question: 'Is this email a phishing attempt or legitimate?',
					options: [{ text: 'Phishing attempt', correct: false }, { text: 'Legitimate email', correct: true }],
					explanation: 'This is a typical, low-pressure security notification: correct domain, no embedded urgent link demanding credentials, and it tells you to navigate to your dashboard yourself rather than clicking through.',
					redFlags: ['No urgency or threats', 'Directs you to log in independently, not via an embedded link', 'Consistent sender domain']
				},
				{
					type: 'email', from: 'billing@netflix-invoice-center.info', to: 'you@example.com',
					subject: 'Your payment could not be processed',
					body: "We were unable to charge your card on file for this month's subscription. Update your payment details within 12 hours to avoid interruption:\n\nhttp://netflix-invoice-center.info/update-billing\n\nNetflix Billing Team",
					question: 'Is this email a phishing attempt or legitimate?',
					options: [{ text: 'Phishing attempt', correct: true }, { text: 'Legitimate email', correct: false }],
					explanation: 'Real billing notices come from the actual netflix.com domain, not a third-party ".info" site. The short deadline and unfamiliar domain are classic phishing pressure tactics.',
					redFlags: ['Unofficial ".info" domain', 'Extremely short deadline', 'Requests payment detail update via email link']
				}
			]
		},
		{
			id: 'spearphishing', name: 'Spear Phishing Simulator', icon: '🎯', difficulty: 'Medium', risk: 'High',
			desc: 'Personalized attacks that use real names, roles and projects to feel trustworthy.',
			scenarios: [
				{
					type: 'email', from: 'm.reyes@yourcompany-hr.net', to: 'you@yourcompany.com',
					subject: 'Re: Updated benefits enrollment — action needed by Friday',
					body: "Hi,\n\nFollowing up on the open enrollment meeting last week — HR needs you to confirm your dependent information before Friday's deadline using the secure portal below.\n\nhttps://yourcompany-hr.net/benefits/confirm\n\nThanks,\nMaria Reyes\nHR Business Partner",
					question: 'This email references a real meeting and uses a colleague\'s name. Safe to click?',
					options: [{ text: 'No — verify through a separate channel first', correct: true }, { text: 'Yes, it references real context so it must be genuine', correct: false }],
					explanation: 'Attackers research LinkedIn, org charts and meeting invites to sound convincing. The domain "yourcompany-hr.net" is not your real company domain — always confirm HR requests through your known internal portal or by calling the person directly.',
					redFlags: ['External lookalike domain mimicking HR', 'Reused real names/meetings for false credibility', 'Embedded link instead of internal portal']
				},
				{
					type: 'email', from: 'james.park@yourcompany.com', to: 'you@yourcompany.com',
					subject: 'Quick favor before my flight',
					body: "Hey, I'm about to board and can't get to my laptop. Can you send me the Q3 marketing budget spreadsheet to my personal email, jpark.travel@gmail.com? Need it for a client call. Thanks!",
					question: 'Your actual manager\'s email, but asking you to send sensitive files to a personal Gmail. What should you do?',
					options: [{ text: 'Verify by calling or messaging him on a known number first', correct: true }, { text: 'Send it — it is from his real work address', correct: false }],
					explanation: 'Even a correct-looking sender address can be spoofed or compromised. Requests to reroute sensitive data to personal accounts, especially with time pressure ("before my flight"), warrant out-of-band verification.',
					redFlags: ['Request to send sensitive data to a personal account', 'Urgency tied to unavailability ("about to board")', 'Bypasses normal file-sharing channels']
				}
			]
		},
		{
			id: 'whaling', name: 'Whaling Attack Simulator', icon: '🐋', difficulty: 'Hard', risk: 'Critical',
			desc: 'Executive-targeted phishing designed to authorize large transfers or leak strategic data.',
			scenarios: [
				{
					type: 'email', from: 'ceo.office@yourcompany-legal.com', to: 'cfo@yourcompany.com',
					subject: 'CONFIDENTIAL: Acquisition wire transfer — time sensitive',
					body: "This is highly confidential and must stay between us until the announcement. Our legal counsel needs an urgent wire of $480,000 to close the acquisition today. Details attached — please process immediately and confirm once done. Do not discuss with anyone else on the team yet.\n\n— Sent from my iPhone",
					question: 'As the CFO, how should you respond to this "CEO" request?',
					options: [{ text: 'Verify via a known phone number/second approver before any transfer', correct: true }, { text: 'Process the wire immediately since secrecy and speed are requested', correct: false }],
					explanation: 'This is textbook whaling/BEC: confidentiality to prevent verification, urgency to prevent scrutiny, and a request that bypasses normal dual-approval controls. Legitimate finance changes should never rely on secrecy.',
					redFlags: ['Domain resembling but not matching the real company', 'Instruction to keep it secret from colleagues', 'Bypasses standard approval workflow', 'High-value, time-pressured wire request']
				},
				{
					type: 'email', from: 'board.secretary@yourcompany.com', to: 'coo@yourcompany.com',
					subject: 'Board requests strategic roadmap ahead of Monday session',
					body: "Hello,\n\nAhead of Monday's board session, could you share the current 18-month strategic roadmap and the unreleased product financials? Please reply to this thread directly.\n\nBest,\nBoard Secretary",
					question: 'A legitimate-looking internal request for sensitive strategic documents. Best action?',
					options: [{ text: 'Confirm the request through the official board liaison process before sharing', correct: true }, { text: 'Reply-all with the documents attached to move quickly', correct: false }],
					explanation: 'Even internal-looking addresses can be spoofed or compromised. Sensitive strategic or financial documents should go through an established, verified request channel — not an unexpected email thread.',
					redFlags: ['Request for highly sensitive unreleased data', 'Pressure of an upcoming deadline', 'Reply-directly-to-thread pattern skips verification']
				}
			]
		},
		{
			id: 'smishing', name: 'Smishing Simulator', icon: '📱', difficulty: 'Easy', risk: 'Medium',
			desc: 'Fake SMS messages — decide whether each text is safe or suspicious.',
			scenarios: [
				{
					type: 'sms', appLabel: 'Messages · Unknown Sender', messages: [
						{ from: 'in', text: 'USPS: Your package has a $2.99 unpaid customs fee. Pay now to avoid return to sender: usps-fee-pay.com/track' }],
					question: 'Safe or suspicious?', options: [{ text: 'Suspicious', correct: true }, { text: 'Safe', correct: false }],
					explanation: 'Postal services don\'t collect customs fees via SMS links to unofficial domains. Small "just pay a tiny fee" amounts are designed to feel low-risk enough to click without thinking.',
					redFlags: ['Unofficial domain, not usps.com', 'Small urgent fee designed to lower suspicion', 'Threat of returned package creates pressure']
				},
				{
					type: 'sms', appLabel: 'Messages · Mom', messages: [
						{ from: 'in', text: 'Hey, running 10 mins late for dinner, see you at 7:10 instead of 7? 😊' }],
					question: 'Safe or suspicious?', options: [{ text: 'Suspicious', correct: false }, { text: 'Safe', correct: true }],
					explanation: 'A normal, low-stakes personal message from a known, saved contact with no links, requests for money, or credentials involved.',
					redFlags: []
				},
				{
					type: 'sms', appLabel: 'Messages · +1 (555) 019-2231', messages: [
						{ from: 'in', text: 'Your bank account has been locked due to suspicious activity. Verify your identity now: secure-bankverify.info/unlock or your card will be closed today.' }],
					question: 'Safe or suspicious?', options: [{ text: 'Suspicious', correct: true }, { text: 'Safe', correct: false }],
					explanation: 'Banks generally don\'t ask you to "verify identity" via a link in an unsolicited text. The unfamiliar domain and same-day threat are designed to trigger panic clicking.',
					redFlags: ['Unfamiliar shortened/unofficial domain', 'Same-day threat of account closure', 'Sent from a generic phone number, not a bank shortcode']
				}
			]
		},
		{
			id: 'vishing', name: 'Vishing Simulator', icon: '📞', difficulty: 'Medium', risk: 'High',
			desc: 'Fake phone call scripts — recognize social engineering happening in real time.',
			scenarios: [
				{
					type: 'scene', tag: 'INCOMING CALL TRANSCRIPT — "Microsoft Support"',
					text: '"Hello, this is David from Microsoft Technical Support. Our servers have detected a virus sending data from your computer right now. I need you to open a remote access tool so I can remove it before your files are encrypted. Can you go to your browser and type in the address I give you?"',
					question: 'What should you do on this call?',
					options: [{ text: 'Hang up and contact support through official channels yourself', correct: true }, { text: 'Follow the instructions since they sound technical and urgent', correct: false }],
					explanation: 'Microsoft and other vendors do not make unsolicited calls about viruses on your machine. Any request to install remote-access software during a cold call is a major red flag for a takeover scam.',
					redFlags: ['Unsolicited call claiming to be tech support', 'Request to install remote access software', 'Manufactured urgency about "encryption" starting now']
				},
				{
					type: 'scene', tag: 'INCOMING CALL TRANSCRIPT — "IT Helpdesk"',
					text: '"Hi, this is Alex from IT. We\'re migrating everyone to the new SSO system today and I need to confirm your current password so we can map your account correctly — it won\'t work otherwise."',
					question: 'A caller claiming to be IT asks for your current password. What do you do?',
					options: [{ text: 'Refuse — IT never needs your actual password', correct: true }, { text: 'Give it since it is needed for a system migration', correct: false }],
					explanation: 'Legitimate IT departments never need your plaintext password for any migration; systems are designed around resets, not password disclosure. This is a pretexting/vishing attempt to harvest credentials.',
					redFlags: ['Request for a live password, ever', 'Invented technical justification for something IT would never need', 'Pressure tied to "today\'s migration"']
				}
			]
		},
		{
			id: 'quishing', name: 'QR Phishing (Quishing)', icon: '🔳', difficulty: 'Medium', risk: 'Medium',
			desc: 'QR codes hide destinations from plain view — decide whether to trust or reject.',
			scenarios: [
				{
					type: 'qr', context: 'A flyer taped over a real parking meter reads: "New contactless payment — scan to pay for parking" with a QR code covering the original sticker.',
					question: 'Trust or reject this QR code?', options: [{ text: 'Reject', correct: true }, { text: 'Trust', correct: false }],
					explanation: 'QR codes stuck over existing official signage in public places are a known tactic — the code can lead anywhere, and you can\'t see the URL before scanning. Use the meter\'s official app or payment method instead.',
					redFlags: ['QR sticker placed over existing official signage', 'No way to preview the destination URL before scanning', 'Unusual location for a "new" payment method to appear']
				},
				{
					type: 'qr', context: 'A colleague shares a QR code in the team chat that opens your company\'s official, previously-bookmarked expense reporting tool, matching the URL preview shown by the chat app.',
					question: 'Trust or reject this QR code?', options: [{ text: 'Reject', correct: false }, { text: 'Trust', correct: true }],
					explanation: 'The link preview confirms the destination matches your known, official internal tool, and it was shared directly by a verified colleague through a trusted channel — reasonable to proceed.',
					redFlags: []
				}
			]
		},
		{
			id: 'fakewebsite', name: 'Fake Website Detector', icon: '🌐', difficulty: 'Medium', risk: 'High',
			desc: 'Spot domain tricks, missing HTTPS, typosquatting and unicode look-alikes.',
			scenarios: [
				{
					type: 'website', url: 'http://www.arnaz0n-deals.com/prime-renewal', bodyText: '"Your Prime membership has expired — renew now to keep your benefits."',
					question: 'Legitimate Amazon page or fake?', options: [{ text: 'Fake', correct: true }, { text: 'Legitimate', correct: false }],
					explanation: 'Note the "0" replacing the "o" (arnaz0n), the unrelated domain structure, and plain HTTP instead of HTTPS — none of which match Amazon\'s real domain.',
					redFlags: ['Character substitution (0 for o)', 'No HTTPS padlock', 'Unofficial domain, not amazon.com']
				},
				{
					type: 'website', url: 'https://accounts.google.com/signin/v2/identifier', bodyText: 'Standard Google sign-in page requesting email address, matching the exact known Google domain.',
					question: 'Legitimate or fake?', options: [{ text: 'Fake', correct: false }, { text: 'Legitimate', correct: true }],
					explanation: 'This is the real Google accounts domain over HTTPS — exactly matching what you\'d expect, with no subdomain trickery or added words.',
					redFlags: []
				},
				{
					type: 'website', url: 'https://secure-paypal.account-verify-center.com/login', bodyText: '"Unusual activity detected. Confirm your card number and CVV to restore access."',
					question: 'Legitimate or fake?', options: [{ text: 'Fake', correct: true }, { text: 'Legitimate', correct: false }],
					explanation: '"secure-paypal" is just a subdomain of the attacker\'s real domain, account-verify-center.com — PayPal\'s real domain is paypal.com. Directly asking for a CVV over a login page is also a major tell.',
					redFlags: ['PayPal name used only as a decorative subdomain', 'Real domain is unrelated (account-verify-center.com)', 'Asks for CVV on a "login" page']
				}
			]
		},
		{
			id: 'usbbaiting', name: 'USB Baiting Simulator', icon: '💾', difficulty: 'Medium', risk: 'High',
			desc: 'An unmarked USB drive appears in the office. Decide what to do.',
			scenarios: [
				{
					type: 'scene', tag: 'OFFICE SCENARIO', text: 'You find a USB drive labeled "Confidential — Q4 Layoffs List" sitting on the floor of the parking garage near the entrance.',
					question: 'What should you do?', options: [{ text: 'Hand it to IT/security without plugging it in', correct: true }, { text: 'Plug it into your work laptop to see whose it is', correct: false }],
					explanation: 'This is a classic "USB drop" attack — curiosity-baiting labels make people plug in drives that auto-run malware. Never insert unknown media into any device; report it to IT/security so it can be handled safely.',
					redFlags: ['Enticing, curiosity-driven label', 'Found in a public/semi-public area, not lost-and-found', 'No known owner to verify']
				},
				{
					type: 'scene', tag: 'OFFICE SCENARIO', text: 'IT hands you a new company-branded USB drive during onboarding, sealed in official packaging with your manager present, to load your starter documents.',
					question: 'What should you do?', options: [{ text: 'Hand it to IT/security without plugging it in', correct: false }, { text: 'Use it as instructed by IT', correct: true }],
					explanation: 'A sealed, company-issued drive provided directly by verified IT staff as part of a known onboarding process is a normal, low-risk situation — unlike media of unknown origin.',
					redFlags: []
				}
			]
		},
		{
			id: 'tailgating', name: 'Tailgating Simulator', icon: '🚪', difficulty: 'Easy', risk: 'Medium',
			desc: 'Someone tries to follow you through a badge-controlled door.',
			scenarios: [
				{
					type: 'scene', tag: 'BUILDING ENTRANCE', text: 'You badge into the secure office entrance. A person carrying two large boxes of coffee jogs up saying "Can you hold the door? My badge is in my back pocket and my hands are full!"',
					question: 'What is the appropriate action?', options: [{ text: 'Politely ask them to badge in separately or check in at reception', correct: true }, { text: 'Hold the door — refusing would seem rude', correct: false }],
					explanation: 'Tailgating relies on social pressure and politeness norms. Every person, regardless of how plausible their story, should badge in individually or be verified at reception — this protects everyone, including them.',
					redFlags: ['Hands-full excuse designed to make refusal feel rude', 'No visible/verifiable badge', 'Unfamiliar person with no verification offered']
				},
				{
					type: 'scene', tag: 'BUILDING ENTRANCE', text: 'A coworker you recognize from your own team badges in just ahead of you and holds the door while you tap your own badge on the reader as you walk through.',
					question: 'Is this a security concern?', options: [{ text: 'Yes, a violation', correct: false }, { text: 'No, this is normal and fine', correct: true }],
					explanation: 'You still used your own valid badge on the reader — the door was simply held as a courtesy while each person authenticated individually. That is different from letting someone in without any badge check at all.',
					redFlags: []
				}
			]
		},
		{
			id: 'piggybacking', name: 'Piggybacking Simulator', icon: '🎒', difficulty: 'Easy', risk: 'Medium',
			desc: 'Physical security awareness — knowingly allowing an unauthorized person inside.',
			scenarios: [
				{
					type: 'scene', tag: 'SECURE FLOOR ELEVATOR', text: 'A well-dressed visitor without a badge asks to ride the elevator with you to the "12th floor for a 2pm meeting with the VP," implying you should let them piggyback on your badge access.',
					question: 'What should you do?', options: [{ text: 'Direct them to reception/security to be signed in as a visitor first', correct: true }, { text: 'Let them ride up since they mentioned a real meeting', correct: false }],
					explanation: 'Anyone without their own credentials should be formally checked in and escorted, even if their story sounds plausible — attackers often research real names and meeting times in advance.',
					redFlags: ['No visible visitor badge', 'Relies on a plausible-sounding but unverified meeting', 'Targets a restricted floor']
				},
				{
					type: 'scene', tag: 'SECURE FLOOR ELEVATOR', text: 'A visitor wearing a printed "Visitor — Escort Required" badge waits by reception for their host to arrive and walk them in personally.',
					question: 'Is this appropriate?', options: [{ text: 'No, a violation', correct: false }, { text: 'Yes, correct process', correct: true }],
					explanation: 'This is exactly how visitor access should work: a clearly marked visitor badge and an in-person escort, rather than unverified independent movement through secure areas.',
					redFlags: []
				}
			]
		},
		{
			id: 'shouldersurfing', name: 'Shoulder Surfing Simulator', icon: '👀', difficulty: 'Easy', risk: 'Low',
			desc: 'Spot the security mistakes happening in a busy office or public scene.',
			scenarios: [
				{
					type: 'scene', tag: 'COFFEE SHOP', text: 'An employee works on quarterly financials on a laptop with the screen facing a busy walkway, entering their password out loud to a colleague on speakerphone: "It\'s Summer2024!, same as always."',
					question: 'What is the biggest mistake here?', options: [{ text: 'Screen facing a public walkway while saying the password aloud', correct: true }, { text: 'Working in a coffee shop at all', correct: false }],
					explanation: 'The core mistake is exposure: an unshielded screen showing sensitive data plus a password spoken aloud in public are both trivially observed by anyone nearby, a classic shoulder-surfing risk.',
					redFlags: ['Screen visible to passersby with sensitive data on it', 'Password spoken out loud in a public space', 'Reused, guessable password pattern']
				},
				{
					type: 'scene', tag: 'AIRPORT LOUNGE', text: 'An employee uses a privacy screen filter on their laptop, sits with their back to a wall, and enters their password using a password manager\'s autofill rather than typing it visibly.',
					question: 'Is this good practice?', options: [{ text: 'No, still risky', correct: false }, { text: 'Yes, solid shoulder-surfing precautions', correct: true }],
					explanation: 'Privacy filters, positioning your back to a wall, and using autofill instead of visibly typing credentials are all recommended ways to reduce shoulder-surfing exposure in public spaces.',
					redFlags: []
				}
			]
		},
		{
			id: 'dumpsterdiving', name: 'Dumpster Diving Awareness', icon: '🗑️', difficulty: 'Easy', risk: 'Medium',
			desc: 'Find the sensitive information carelessly thrown away in these trash examples.',
			scenarios: [
				{
					type: 'scene', tag: 'OFFICE RECYCLING BIN', text: 'A printed org chart with employee names and direct phone extensions, an unshredded bank statement with a full account number, and a sticky note reading "WiFi: CorpGuest / Pass: Welcome123" are all sitting in an open recycling bin.',
					question: 'Is this a security risk?', options: [{ text: 'Yes, significant risk', correct: true }, { text: 'No, it\'s just recycling', correct: false }],
					explanation: 'All three items give an attacker free reconnaissance: org structure for pretexting, financial data for fraud, and live network credentials — exactly what dumpster diving is used to collect. Sensitive documents should always be shredded, not recycled whole.',
					redFlags: ['Unshredded document with account numbers', 'Internal org chart with direct contact info', 'Live WiFi credentials on a visible note']
				},
				{
					type: 'scene', tag: 'OFFICE RECYCLING BIN', text: 'The bin contains only cross-shredded paper strips, empty coffee cups, and a flattened cardboard box.',
					question: 'Is this a security risk?', options: [{ text: 'Yes, significant risk', correct: false }, { text: 'No, properly disposed of', correct: true }],
					explanation: 'Cross-shredded documents are unreadable and reassembling them is impractical — this reflects correct disposal practice for sensitive paperwork.',
					redFlags: []
				}
			]
		},
		{
			id: 'wateringhole', name: 'Watering Hole Attack', icon: '🐊', difficulty: 'Hard', risk: 'High',
			desc: 'Attackers compromise a site your industry trusts, waiting for you to visit it.',
			scenarios: [
				{
					type: 'scene', tag: 'THREAT SCENARIO', text: 'A niche industry forum that engineers at your company visit daily for technical discussions was quietly compromised. It now silently attempts to fingerprint visitors\' browsers before serving anything unusual, only to visitors from specific corporate IP ranges.',
					question: 'What makes this a watering hole attack rather than random malvertising?', options: [{ text: 'It targets a site a specific group already trusts, and filters by who visits', correct: true }, { text: 'It shows the same ad to every visitor on the internet', correct: false }],
					explanation: 'Watering hole attacks specifically compromise a resource a target group already frequents and trusts, often adding filtering so the malicious behavior only triggers for the intended targets — making it far stealthier than a mass campaign.',
					redFlags: ['Compromise of a site trusted by a specific professional community', 'Selective targeting by visitor characteristics', 'No unusual behavior for most visitors, reducing detection']
				},
				{
					type: 'scene', tag: 'THREAT SCENARIO', text: 'Your security team notices that a popular, unrelated general news site served a brief ad glitch to all visitors worldwide for about ten minutes before being auto-corrected by the ad network.',
					question: 'Is this most likely a targeted watering hole attack?', options: [{ text: 'Yes', correct: false }, { text: 'No, this looks like generic ad-network noise', correct: true }],
					explanation: 'A brief, universal, self-correcting glitch across all visitors lacks the defining traits of a watering hole attack: targeting a specific trusted community and filtering by who visits.',
					redFlags: []
				}
			]
		},
		{
			id: 'pretexting', name: 'Pretexting Simulator', icon: '🎭', difficulty: 'Medium', risk: 'High',
			desc: 'A fabricated scenario used to extract information — walk through the conversation.',
			scenarios: [
				{
					type: 'sms', appLabel: 'Internal Chat · "IT_Support_Dan"', messages: [
						{ from: 'in', text: 'Hi, this is Dan from IT. We\'re seeing failed login attempts on your account from overseas. Can you confirm your employee ID and the verification code we just texted you?' }],
					question: 'How should you respond?', options: [{ text: 'Verify Dan\'s identity through the official IT ticketing system before sharing anything', correct: true }, { text: 'Send the employee ID and code to resolve it quickly', correct: false }],
					explanation: 'A verification code sent to you is meant to prove your identity to a legitimate system — never to a person who asks you to relay it. This is a classic pretext to hijack a two-factor code.',
					redFlags: ['Asks you to relay a one-time verification code', 'Invented urgency about "failed logins"', 'Contact outside official IT support channel']
				},
				{
					type: 'sms', appLabel: 'Internal Chat · "IT Service Desk"', messages: [
						{ from: 'in', text: 'Hi, this is an automated reminder from your logged IT ticket #4521: your password reset is complete. No action needed from you.' }],
					question: 'Any concern here?', options: [{ text: 'Yes, suspicious', correct: false }, { text: 'No, this is a routine notice', correct: true }],
					explanation: 'This message references a ticket number, requires no action, and asks for no information — a normal closed-loop system notice rather than an attempt to extract anything.',
					redFlags: []
				}
			]
		},
		{
			id: 'impersonation', name: 'Impersonation Attack', icon: '🪪', difficulty: 'Medium', risk: 'High',
			desc: 'A visitor claims to be someone they are not. Decide whether to trust them.',
			scenarios: [
				{
					type: 'scene', tag: 'FRONT DESK', text: 'A person in a utility company uniform arrives without an appointment, saying "Gas leak inspection, I need access to the server room to check nearby piping — it\'s urgent."',
					question: 'What should you do?', options: [{ text: 'Verify with the utility company and your facilities team before granting any access', correct: true }, { text: 'Let them in immediately given the safety claim', correct: false }],
					explanation: 'Uniforms are trivial to obtain or imitate. Urgent, safety-framed requests for access to sensitive areas like server rooms should always be verified with the actual vendor and your own facilities/security team first.',
					redFlags: ['Unscheduled visit with urgency framing', 'Requests access to a sensitive, unrelated area (server room)', 'No prior verification through facilities']
				},
				{
					type: 'scene', tag: 'FRONT DESK', text: 'A scheduled vendor technician arrives with ID matching the appointment confirmation your facilities team received in advance, and is escorted directly to the pre-approved work area.',
					question: 'Is this appropriate?', options: [{ text: 'No, still a risk', correct: false }, { text: 'Yes, correctly verified', correct: true }],
					explanation: 'A pre-scheduled appointment confirmed in advance, matching photo ID, and an escort to only the approved area reflects the correct verification process for legitimate visitors.',
					redFlags: []
				}
			]
		},
		{
			id: 'bec', name: 'Business Email Compromise (BEC)', icon: '💼', difficulty: 'Hard', risk: 'Critical',
			desc: 'Realistic corporate email fraud targeting invoices, payroll and vendor payments.',
			scenarios: [
				{
					type: 'email', from: 'accounts@vendor-invoicing-corp.com', to: 'ap@yourcompany.com',
					subject: 'Updated banking details for upcoming invoice #88213',
					body: "Hello,\n\nPlease note we've changed banks. Kindly update our records with the new account details below before processing invoice #88213 due this week.\n\nNew Account: 00291337\nRouting: 041000124\n\nThank you,\nVendor Accounts Team",
					question: 'A known vendor emails new banking details right before a payment is due. Best action?',
					options: [{ text: 'Call the vendor using a verified, previously-known phone number to confirm', correct: true }, { text: 'Update the records and process the invoice as requested', correct: false }],
					explanation: 'Sudden banking-detail changes delivered only by email, timed right before a payment, are the single most common BEC pattern. Always confirm changes through a separately verified contact method, never by replying to the same email thread.',
					redFlags: ['Banking change requested only via email', 'Timed right before a real invoice is due', 'No verification channel offered other than replying']
				},
				{
					type: 'email', from: 'payroll@yourcompany.com', to: 'you@yourcompany.com',
					subject: 'Your direct deposit form on file needs updating',
					body: "Hi,\n\nAs part of our annual payroll audit, please log into the HR portal at portal.yourcompany.com to confirm your direct deposit information is current. No immediate action is required if your details haven't changed.\n\nHR Payroll Team",
					question: 'Is this a BEC red flag?', options: [{ text: 'Yes', correct: false }, { text: 'No, this looks like routine internal process', correct: true }],
					explanation: 'This points to your company\'s real, known internal portal domain, carries no urgency, and explicitly says no action is needed if nothing changed — consistent with a routine internal audit notice.',
					redFlags: []
				}
			]
		},
		{
			id: 'techsupport', name: 'Tech Support Scam', icon: '🖥️', difficulty: 'Easy', risk: 'Medium',
			desc: 'Fake browser popups designed to trigger panic calls to a "support" number.',
			scenarios: [
				{
					type: 'popup', heading: '⚠ WINDOWS SECURITY ALERT', body: 'Your computer has been infected with 5 viruses! Call Microsoft Support IMMEDIATELY at 1-800-555-0134 to prevent data loss. Do not restart or shut down your computer.',
					question: 'What should you do when this popup appears?', options: [{ text: 'Close the browser/tab (or restart if stuck) — never call the number', correct: true }, { text: 'Call the number shown to get help removing the viruses', correct: false }],
					explanation: 'Real operating systems and antivirus tools never instruct you to call a phone number from a browser popup. This is a scare-tactic popup designed to get you to call a scam call center that will ask for remote access and payment.',
					redFlags: ['Instructs you to call a phone number for a "virus"', 'Warns against restarting/closing (isolation tactic)', 'Generic browser popup impersonating an OS-level alert']
				},
				{
					type: 'popup', heading: 'Update available', body: 'A new version of your browser is available. Would you like to update now or later?',
					question: 'Is this popup a scam pattern?', options: [{ text: 'Yes', correct: false }, { text: 'No, a normal update prompt', correct: true }],
					explanation: 'A calm, optional prompt with no urgency, no phone numbers, and no threats is consistent with a routine software update notification.',
					redFlags: []
				}
			]
		},
		{
			id: 'socialmedia', name: 'Social Media Scam Simulator', icon: '📲', difficulty: 'Medium', risk: 'Medium',
			desc: 'Analyze fake posts and DMs across Instagram, Facebook, LinkedIn, X and WhatsApp.',
			scenarios: [
				{
					type: 'social', platform: 'LinkedIn', handle: 'Talent Partner · TechGrowth Global', postText: '"We reviewed your profile and would like to offer you a Senior Analyst role, $145k remote — no interview needed! Just complete onboarding by sharing your SSN and a copy of your ID to reserve your seat: bit.ly/tg-onboard"',
					question: 'Legitimate recruiting message or scam?', options: [{ text: 'Scam', correct: true }, { text: 'Legitimate', correct: false }],
					explanation: 'Real employers do not skip interviews or ask for your SSN/ID over a DM and shortened link. This is a job-offer scam designed to harvest identity documents.',
					redFlags: ['Offer with no interview process', 'Requests SSN/ID over direct message', 'Shortened, unverifiable link']
				},
				{
					type: 'social', platform: 'WhatsApp', handle: '+44 7700 900xxx (Unsaved number)', postText: '"Hi love, it\'s your cousin, I lost my phone and I\'m texting from a friend\'s number. Can you send me $200 via gift card right now, I\'ll explain later?"',
					question: 'Legitimate family emergency or scam?', options: [{ text: 'Scam', correct: true }, { text: 'Legitimate', correct: false }],
					explanation: 'The "lost phone, new number, urgent money via gift card" pattern is a very common impersonation scam. Gift cards are untraceable, which is exactly why scammers request them. Verify by calling the real person\'s known number first.',
					redFlags: ['Unsaved/unknown number claiming to be family', 'Request for gift cards (untraceable)', 'Urgency preventing verification']
				},
				{
					type: 'social', platform: 'Instagram', handle: '@fitness_giveaway_official', postText: '"🎉 Congrats! You\'ve been randomly selected to win a free smartwatch. Just pay $4.99 shipping by entering your card details here: giveaway-claim-page.net"',
					question: 'Legitimate giveaway or scam?', options: [{ text: 'Scam', correct: true }, { text: 'Legitimate', correct: false }],
					explanation: '"You won" messages that ask for card details to cover a tiny "shipping fee" are a common way to harvest full payment card numbers, often followed by recurring unauthorized charges.',
					redFlags: ['Unsolicited "you won" messaging', 'Card details requested for a trivial fee', 'Unofficial claim-page domain']
				}
			]
		},
		{
			id: 'romance', name: 'Romance Scam Awareness', icon: '💔', difficulty: 'Medium', risk: 'High',
			desc: 'Educational-only simulation of manipulation patterns used in romance scams.',
			scenarios: [
				{
					type: 'sms', appLabel: 'Dating App · Match: "Alex, works on oil rig"', messages: [
						{ from: 'in', text: 'I feel like we have such a deep connection after just two weeks. I\'m stuck at a job site overseas and my payment is delayed — could you send $800 to help me buy a flight to finally meet you?' }],
					question: 'What pattern does this reflect?', options: [{ text: 'A romance scam manipulation pattern', correct: true }, { text: 'A normal early relationship request', correct: false }],
					explanation: 'Rapid declarations of deep connection, a conveniently unverifiable overseas job, and a request for money before ever meeting in person are hallmark romance-scam tactics that manufacture emotional urgency.',
					redFlags: ['Accelerated emotional intimacy in a short time', 'Unverifiable overseas circumstances', 'Money requested before any in-person meeting']
				},
				{
					type: 'sms', appLabel: 'Dating App · Match: "Priya"', messages: [
						{ from: 'in', text: 'This was fun chatting! I\'d love to meet for coffee this weekend somewhere public if you\'re comfortable — no pressure either way.' }],
					question: 'What pattern does this reflect?', options: [{ text: 'A romance scam manipulation pattern', correct: false }, { text: 'A normal, healthy interaction', correct: true }],
					explanation: 'Suggesting a public first meeting with no pressure and no financial requests is consistent with typical, healthy early dating communication.',
					redFlags: []
				}
			]
		},
		{
			id: 'deepfake', name: 'AI Deepfake Awareness', icon: '🧬', difficulty: 'Hard', risk: 'Critical',
			desc: 'Illustrative, fictional examples of manipulated audio, video and conversations.',
			scenarios: [
				{
					type: 'scene', tag: 'ILLUSTRATIVE SCENARIO (fictional)', text: 'You receive a video call that looks and sounds like your company\'s CEO, but the connection is unusually low quality, the mouth movements lag slightly behind the audio, and the "CEO" urgently insists you approve a large payment right now without using the usual approval chat channel.',
					question: 'What should you do?', options: [{ text: 'Pause and verify independently before taking any action', correct: true }, { text: 'Comply immediately since it looks and sounds like the CEO', correct: false }],
					explanation: 'AI voice/video cloning can convincingly mimic real people. Subtle audio/video artifacts plus a request to skip standard approval processes under urgency are the real signals to act on — not how convincing the face and voice seem.',
					redFlags: ['Audio/video quality artifacts or lag', 'Instruction to bypass standard verification/approval steps', 'High urgency, high-value request']
				},
				{
					type: 'scene', tag: 'ILLUSTRATIVE SCENARIO (fictional)', text: 'A voicemail claiming to be from a relative asks for money using a voice that sounds "close but slightly off," with an unusual request to keep it secret from other family members and to only communicate via text going forward.',
					question: 'What should you do?', options: [{ text: 'Verify by calling the relative back on their known number', correct: true }, { text: 'Send the money and keep it secret as asked', correct: false }],
					explanation: 'Secrecy requests and channel restrictions (e.g., "only text me") are designed to prevent you from verifying with the real person or other family members — a strong signal to independently confirm before acting.',
					redFlags: ['Request for secrecy from other trusted people', 'Insistence on a single, unverifiable communication channel', 'Emotional urgency involving a "relative" in trouble']
				}
			]
		}
	];

	/* Assign consistent difficulty/risk tag classes & compute totals per module */
	MODULES.forEach(m => { m.totalScenarios = m.scenarios.length; });

	/* ------------------------------------------------------------
		 4. LEARNING CENTER CONTENT (per module)
		 ------------------------------------------------------------ */
	const LEARNING = {
		phishing: {
			definition: 'Phishing is a mass-scale attempt to trick people into revealing credentials, financial data, or installing malware, typically via email that impersonates a trusted brand or service.',
			example: 'A wave of emails impersonating a shipping carrier tells recipients a package is "held" and asks them to "pay a redelivery fee" through a fake payment page.',
			prevention: ['Hover over links to check the real destination before clicking', 'Navigate to services directly by typing the known URL instead of clicking email links', 'Enable multi-factor authentication so a stolen password alone isn\'t enough', 'Report suspicious emails to your IT/security team'],
			redFlags: ['Urgent deadlines or threats of suspension', 'Generic greetings like "Dear Customer"', 'Lookalike domains and misspellings', 'Requests for credentials or payment info via email'],
			dos: ['Verify sender domains carefully', 'Use a password manager (it won\'t autofill on fake domains)', 'Report, don\'t just delete'],
			donts: ['Don\'t click links in unsolicited urgent emails', 'Don\'t reuse passwords across sites', 'Don\'t assume a familiar logo means it\'s real']
		},
		spearphishing: {
			definition: 'Spear phishing is a targeted phishing attack customized with real details about a specific person — their name, role, colleagues, or projects — to appear far more credible than mass phishing.',
			example: 'An attacker who scraped a company\'s org chart from LinkedIn emails a junior employee, referencing their actual manager\'s name to request an urgent gift card purchase.',
			prevention: ['Verify unusual requests through a second channel (phone, in person)', 'Be cautious about how much project/org detail is public on social media', 'Slow down on personalized urgency, even if details seem accurate', 'Confirm any request to change financial or file-sharing destinations'],
			redFlags: ['Correct personal/organizational details paired with an unusual request', 'Requests to reroute sensitive info to personal accounts', 'Domain that is close to, but not exactly, your real company domain'],
			dos: ['Cross-check requests via a known phone number', 'Treat "reply directly" pressure with suspicion'],
			donts: ['Don\'t assume accurate details prove authenticity', 'Don\'t skip verification because someone seems rushed']
		},
		whaling: {
			definition: 'Whaling targets senior executives specifically, using tailored pretexts (mergers, legal matters, board requests) because their approvals carry outsized authority.',
			example: 'A fake "law firm" email to a CFO requests an urgent, confidential wire transfer to close a supposed acquisition, explicitly asking that it not be discussed with the team yet.',
			prevention: ['Enforce dual-approval for large wires regardless of who requests them', 'Treat "keep this confidential from your team" as a major red flag', 'Executives should have a verified back-channel for sensitive confirmations'],
			redFlags: ['Secrecy demanded from internal colleagues', 'Bypassing standard financial controls', 'High-value, high-urgency asks framed as confidential'],
			dos: ['Apply the same verification rules to executives as to everyone else', 'Use out-of-band confirmation for large financial requests'],
			donts: ['Don\'t let seniority of the "requester" skip verification', 'Don\'t process urgent wires without a second approver']
		},
		smishing: {
			definition: 'Smishing is phishing conducted via SMS text message, often exploiting the trust and immediacy people give to texts compared to email.',
			example: 'A text claiming to be from a delivery service asks for a small "redelivery fee" via a shortened link that leads to a credential-harvesting page.',
			prevention: ['Don\'t tap links in unexpected texts, especially from unknown numbers', 'Go directly to the official app or website instead', 'Block and report suspicious numbers'],
			redFlags: ['Unfamiliar sender number for a "known" brand', 'Small fees or urgent account threats', 'Shortened or unusual-looking links'],
			dos: ['Verify by contacting the company through official channels', 'Check for consistent, known sender IDs'],
			donts: ['Don\'t assume texts are safer than email', 'Don\'t enter credentials after tapping a texted link']
		},
		vishing: {
			definition: 'Vishing is voice phishing — attackers call pretending to be a bank, tech support, or internal IT to extract information or push victims into risky actions live over the phone.',
			example: 'A caller claiming to be "Microsoft Support" convinces a victim to install remote-access software to "remove a virus," then uses that access to steal data or lock the machine.',
			prevention: ['Hang up and call back using an official, independently-found number', 'Never install remote access software for an unsolicited caller', 'Never share one-time passcodes or full passwords over the phone'],
			redFlags: ['Unsolicited call about a security problem', 'Requests to install software or share a live code', 'High-pressure scripted urgency'],
			dos: ['Verify caller identity independently before acting', 'End the call if pressured'],
			donts: ['Don\'t give out one-time codes over the phone, ever', 'Don\'t let a caller stay on the line while you "verify" them']
		},
		quishing: {
			definition: 'Quishing uses QR codes to hide a malicious destination URL that isn\'t visible until after scanning, often placed over legitimate signage in public spaces.',
			example: 'A fake parking-payment sticker with a QR code is placed over a legitimate meter, leading scanners to a fraudulent payment page.',
			prevention: ['Prefer official apps over scanning unknown public QR codes', 'Check the link preview your phone shows before opening it', 'Be suspicious of QR codes stuck over existing signage'],
			redFlags: ['QR codes placed over existing official material', 'No verifiable source for the code', 'Requests for payment/login immediately after scanning'],
			dos: ['Preview URLs before opening them', 'Use known official channels instead of an unverified QR code'],
			donts: ['Don\'t scan random public QR codes on faith', 'Don\'t enter payment details on a page reached via unknown QR']
		},
		fakewebsite: {
			definition: 'Fake websites imitate real brands using typosquatted domains, unicode look-alike characters, or added subdomains to trick users into entering credentials or payment data.',
			example: 'A domain like "secure-paypal.account-verify-center.com" uses "PayPal" only as a decorative subdomain while the real, attacker-owned domain is entirely different.',
			prevention: ['Read the full domain carefully, right to left, focusing on what comes just before ".com"', 'Use bookmarks for sensitive sites instead of search results or links', 'Check for HTTPS, though its presence alone isn\'t proof of legitimacy'],
			redFlags: ['Character substitutions (0 for o, rn for m)', 'Brand name appearing only as a subdomain', 'Requests for full card details (like CVV) on a "login" page'],
			dos: ['Type known URLs directly or use saved bookmarks', 'Use a password manager that won\'t autofill on the wrong domain'],
			donts: ['Don\'t trust a domain just because it "contains" a brand name', 'Don\'t assume HTTPS alone means a site is legitimate']
		},
		usbbaiting: {
			definition: 'USB baiting drops infected drives in places employees will find them, relying on curiosity to get someone to plug them into a work machine.',
			example: 'A drive labeled "Confidential Salaries 2024" is left in a parking lot, engineered to be irresistible to find and open.',
			prevention: ['Never plug in unknown removable media', 'Turn found drives directly in to IT/security', 'Disable autorun on company devices as a technical control'],
			redFlags: ['Enticing or curiosity-driven labeling', 'Found in public/semi-public areas', 'No verifiable owner'],
			dos: ['Report found media to security', 'Let IT inspect any unknown device safely'],
			donts: ['Don\'t plug in unknown drives "just to check whose it is"', 'Don\'t assume a professional-looking label means it\'s safe']
		},
		tailgating: {
			definition: 'Tailgating is following an authorized person through a secured door without using your own credentials, often by exploiting politeness.',
			example: 'Someone carrying boxes asks an employee to hold a badge-controlled door because their "hands are full."',
			prevention: ['Ask everyone to badge in individually, regardless of the story', 'Direct unbadged visitors to reception', 'Normalize polite verification as standard practice, not rudeness'],
			redFlags: ['Excuses designed to make refusal feel impolite', 'No visible or working badge', 'Unfamiliar person at a secure access point'],
			dos: ['Verify every person\'s access individually', 'Treat verification as a courtesy to everyone\'s safety'],
			donts: ['Don\'t let "seems nice" substitute for a badge check', 'Don\'t feel obligated to hold secure doors for strangers']
		},
		piggybacking: {
			definition: 'Piggybacking is closely related to tailgating: gaining physical access by accompanying an authorized person, often with a plausible cover story rather than force.',
			example: 'A visitor without a badge asks to ride an elevator to a restricted floor, citing a "meeting with the VP" to seem legitimate.',
			prevention: ['Route all visitors through reception and issue visible visitor badges', 'Require escorts for any unbadged individual', 'Verify claimed appointments with the actual host before granting access'],
			redFlags: ['No visitor badge or escort', 'Plausible-sounding but unverified meeting claims', 'Access requested to sensitive/restricted floors'],
			dos: ['Escort all visitors personally', 'Confirm appointments directly with the host'],
			donts: ['Don\'t assume confidence equals legitimacy', 'Don\'t skip visitor sign-in for convenience']
		},
		shouldersurfing: {
			definition: 'Shoulder surfing is observing someone\'s screen, keyboard, or spoken information in person to capture sensitive data like passwords or financial details.',
			example: 'An employee working on financials in a coffee shop leaves their screen facing a busy walkway while saying their password aloud on a call.',
			prevention: ['Use privacy screen filters in public spaces', 'Sit with your back to a wall when working on sensitive material', 'Never say passwords or codes aloud in public'],
			redFlags: ['Screens visible to passersby with sensitive content', 'Passwords or codes spoken aloud', 'Sensitive work done in high-traffic public areas'],
			dos: ['Use privacy filters and mindful seating', 'Use autofill/password managers instead of typing visibly'],
			donts: ['Don\'t discuss credentials aloud in public', 'Don\'t assume no one is looking']
		},
		dumpsterdiving: {
			definition: 'Dumpster diving is physically searching an organization\'s trash or recycling for sensitive documents, credentials, or reconnaissance material.',
			example: 'An unshredded bank statement and a sticky note with WiFi credentials are found together in an office recycling bin.',
			prevention: ['Cross-shred all documents containing personal, financial, or credential data', 'Never write down passwords or WiFi credentials on paper left in the open', 'Maintain clear desk and clear bin policies'],
			redFlags: ['Unshredded sensitive documents in the trash', 'Credentials or org charts discarded whole', 'No clear disposal policy in place'],
			dos: ['Shred before discarding anything sensitive', 'Store credentials in a password manager, not on paper'],
			donts: ['Don\'t recycle documents with account or personal data intact', 'Don\'t leave WiFi passwords on visible notes']
		},
		wateringhole: {
			definition: 'A watering hole attack compromises a website or resource that a specific target group already trusts and frequents, waiting for them to visit rather than attacking them directly.',
			example: 'A niche industry forum used daily by engineers at a target company is quietly compromised and configured to only serve malicious content to visitors from that company\'s network.',
			prevention: ['Keep browsers and plugins patched to reduce exploitable surface', 'Use endpoint protection that can catch anomalous behavior post-compromise', 'Segment networks so a single compromised workstation has limited reach'],
			redFlags: ['Unusual behavior isolated to trusted, niche sites', 'Targeting/filtering based on visitor characteristics', 'Compromise of sites the specific group already trusts'],
			dos: ['Keep software patched and monitored', 'Report unusual site behavior to IT/security'],
			donts: ['Don\'t assume a "trusted" site is inherently safe forever', 'Don\'t ignore odd browser behavior on familiar sites']
		},
		pretexting: {
			definition: 'Pretexting is inventing a plausible fabricated scenario (an IT issue, an audit, a delivery problem) to manipulate someone into revealing information or taking an action.',
			example: 'A message claiming to be from "IT Support" asks an employee to relay a one-time verification code that was just texted to them, to "resolve failed logins."',
			prevention: ['Never relay one-time codes to anyone who contacts you asking for them', 'Verify unexpected requests through official, independently-found channels', 'Be skeptical of invented technical justifications for unusual requests'],
			redFlags: ['Requests to relay verification codes or passwords', 'Fabricated technical urgency', 'Contact through unofficial channels claiming to be a trusted department'],
			dos: ['Verify identity through your organization\'s official system/ticketing', 'Treat any code-relay request as a red flag'],
			donts: ['Don\'t share one-time codes with anyone, ever', 'Don\'t trust a plausible story alone as proof of identity']
		},
		impersonation: {
			definition: 'Impersonation attacks involve someone posing as an employee, vendor, or authority figure — often using a uniform, title, or fabricated urgency — to gain physical or informational access.',
			example: 'Someone in a utility uniform claims an urgent "gas leak inspection" requires access to a server room, without a scheduled appointment.',
			prevention: ['Verify all vendor/utility visits through your facilities team and the actual company, independently of the visitor\'s claims', 'Require scheduled appointments and ID checks for any restricted access', 'Escort all visitors to only their approved areas'],
			redFlags: ['No scheduled appointment paired with urgency', 'Access requested to unrelated sensitive areas', 'Reliance on uniform/title alone as proof'],
			dos: ['Confirm any vendor visit independently before granting access', 'Escort visitors at all times'],
			donts: ['Don\'t treat a uniform or title as sufficient verification', 'Don\'t grant access to sensitive areas under time pressure']
		},
		bec: {
			definition: 'Business Email Compromise targets companies\' financial processes — vendor payments, payroll, or wire transfers — often through compromised or spoofed executive/vendor accounts.',
			example: 'A "vendor" emails updated banking details right before an invoice is due, redirecting a real payment to an attacker-controlled account.',
			prevention: ['Confirm any banking/payment detail changes via a previously known phone number, not the email itself', 'Apply dual-approval to wire transfers and vendor detail changes', 'Train finance staff specifically on BEC patterns'],
			redFlags: ['Payment/banking changes requested only by email', 'Timing that coincides with a real, upcoming payment', 'No independent verification channel offered'],
			dos: ['Call a known contact to confirm any financial change request', 'Use standardized, verified vendor-update procedures'],
			donts: ['Don\'t update banking details based on email alone', 'Don\'t skip dual-approval for urgent-sounding requests']
		},
		techsupport: {
			definition: 'Tech support scams use fake browser popups or cold calls claiming your device is infected, pressuring you to call a number or grant remote access.',
			example: 'A full-screen browser popup claims "5 viruses detected" and instructs you to call a phone number immediately, warning you not to restart your computer.',
			prevention: ['Close the browser tab/window (or force-restart if stuck) instead of calling any number shown', 'Know that legitimate OS/antivirus alerts never ask you to call a phone number', 'Keep antivirus software from a reputable, deliberately-installed source'],
			redFlags: ['Instructions to call a phone number for a "virus"', 'Warnings against restarting/closing the browser', 'Countdown timers or exaggerated infection counts'],
			dos: ['Close the tab or restart your device', 'Run a scan using antivirus software you installed yourself'],
			donts: ['Don\'t call numbers shown in browser popups', 'Don\'t grant remote access based on a popup warning']
		},
		socialmedia: {
			definition: 'Social media scams span fake job offers, prize/giveaway lures, and impersonation DMs across platforms like Instagram, Facebook, LinkedIn, X, and WhatsApp.',
			example: 'A "recruiter" DM offers a high-paying remote job with no interview, asking only for an SSN and ID copy to "reserve a seat."',
			prevention: ['Verify job offers through the company\'s official careers page', 'Never send ID/SSN over direct message', 'Treat "you won" messages requesting payment info with high suspicion'],
			redFlags: ['Job offers with no interview process', 'Unsaved numbers claiming to be family in a money emergency', 'Requests for payment card details to claim a "prize"'],
			dos: ['Verify through official company channels', 'Call known family numbers directly to confirm emergencies'],
			donts: ['Don\'t share ID/SSN over social DMs', 'Don\'t send gift cards to resolve any "emergency"']
		},
		romance: {
			definition: 'Romance scams build a fabricated romantic relationship, often over weeks, specifically to eventually request money, gifts, or financial access — this module is educational only.',
			example: 'A match declares deep feelings within two weeks, then explains they\'re stranded overseas and need money for a flight to finally meet.',
			prevention: ['Be cautious of relationships that escalate to money requests before an in-person meeting', 'Verify claimed circumstances independently where possible', 'Talk to a trusted friend before sending money to an online-only relationship'],
			redFlags: ['Accelerated emotional intimacy', 'Unverifiable overseas circumstances', 'Money or gift requests before meeting in person'],
			dos: ['Suggest a public first meeting instead of sending money', 'Talk to someone you trust before financial decisions involving an online match'],
			donts: ['Don\'t send money to someone you have not met in person', 'Don\'t ignore a pattern of excuses to avoid meeting']
		},
		deepfake: {
			definition: 'AI deepfakes use synthetic audio/video to convincingly impersonate real people\'s voices or faces, increasingly used to add urgency and credibility to social engineering attempts. This module uses only fictional, illustrative examples.',
			example: 'A video call that looks and sounds like a company executive, with subtle lag between audio and lip movement, urgently requests a payment approval outside the normal process.',
			prevention: ['Verify high-stakes or unusual requests through a separate, known channel regardless of how convincing the call looks', 'Establish internal "safe words" or verification steps for sensitive approvals', 'Watch for technical artifacts (lag, lighting, audio glitches) as secondary signals'],
			redFlags: ['Requests to bypass standard approval processes', 'Secrecy or single-channel-only communication demands', 'Technical artifacts in audio/video quality'],
			dos: ['Use a separate verified channel for high-stakes confirmations', 'Establish internal verification protocols in advance'],
			donts: ['Don\'t trust a request purely because the voice/face looks right', 'Don\'t skip verification steps due to urgency']
		}
	};

	/* ------------------------------------------------------------
		 5. GLOBAL 30-QUESTION QUIZ BANK
		 ------------------------------------------------------------ */
	const QUIZ_BANK = [
		{ q: 'What is the primary goal of a phishing email?', options: ['To trick the recipient into revealing information or installing malware', 'To test email server performance', 'To advertise a legitimate product', 'To back up company data'], correct: 0, explanation: 'Phishing exists to manipulate people into handing over credentials, financial data, or running malicious software.' },
		{ q: 'Which of these is the strongest sign of a lookalike domain?', options: ['A long email body', 'Character substitutions like "1" for "l" or "0" for "o"', 'An email signed with a name', 'A message sent on a weekday'], correct: 1, explanation: 'Character substitution is a classic typosquatting technique used to mimic real domains.' },
		{ q: 'Spear phishing is different from regular phishing because it is:', options: ['Sent to more people at once', 'Personalized using real details about the specific target', 'Only sent by text message', 'Always free of spelling errors'], correct: 1, explanation: 'Spear phishing uses researched, personal details to seem far more credible than mass phishing blasts.' },
		{ q: 'Whaling attacks specifically target:', options: ['New hires only', 'Senior executives and high-authority approvers', 'IT help desk staff exclusively', 'Anonymous forum users'], correct: 1, explanation: 'Whaling is phishing aimed at executives whose approvals carry outsized financial or organizational authority.' },
		{ q: 'What should you do if a text message urges immediate payment of a small "customs fee"?', options: ['Pay it since it\'s a small amount', 'Treat it as suspicious and verify through the official carrier site', 'Forward it to friends', 'Reply asking for more details'], correct: 1, explanation: 'Small "low-risk" fees are used specifically to lower suspicion; verify independently instead of paying.' },
		{ q: 'A caller claiming to be tech support asks you to install remote access software during an unsolicited call. This is most likely:', options: ['A routine support procedure', 'A vishing attempt', 'A required security update', 'A billing verification step'], correct: 1, explanation: 'Legitimate vendors do not cold-call asking to install remote access software.' },
		{ q: 'Why are QR codes risky in public places?', options: ['They are always broken', 'The destination URL is hidden until after scanning', 'They only work on old phones', 'They cannot contain links'], correct: 1, explanation: 'QR codes obscure the destination, making it easy to place a malicious one over legitimate signage.' },
		{ q: 'Which detail best indicates a fake website?', options: ['The page uses a blue color scheme', 'The real domain is unrelated to the brand it displays (e.g. brand name only in a subdomain)', 'The page loads quickly', 'The site has a contact page'], correct: 1, explanation: 'A brand name appearing only as a subdomain of an unrelated domain is a strong sign of a spoofed site.' },
		{ q: 'If you find an unlabeled USB drive in a parking lot, you should:', options: ['Plug it into your work computer to identify the owner', 'Turn it in to IT/security without plugging it in', 'Give it to a coworker to test', 'Post about it on social media'], correct: 1, explanation: 'Unknown removable media should never be plugged in — hand it to IT/security for safe handling.' },
		{ q: 'Tailgating primarily exploits which human tendency?', options: ['Curiosity', 'Politeness and reluctance to seem rude', 'Greed', 'Boredom'], correct: 1, explanation: 'Tailgating relies on social pressure — people feel rude refusing to hold a door for someone.' },
		{ q: 'What is the key difference between tailgating and piggybacking in most usage?', options: ['There is no difference; both describe unauthorized physical access, sometimes with cover stories in piggybacking', 'Piggybacking only happens online', 'Tailgating requires no other person present', 'Piggybacking is always authorized'], correct: 0, explanation: 'Both describe gaining unauthorized physical access by accompanying an authorized person, often with piggybacking involving more of a deliberate pretext.' },
		{ q: 'Shoulder surfing is best prevented by:', options: ['Using a stronger password', 'Privacy screen filters and mindful seating in public', 'Turning off WiFi', 'Using a louder voice'], correct: 1, explanation: 'Privacy filters and positioning reduce the chance someone can observe your screen or actions.' },
		{ q: 'Dumpster diving attacks are best prevented by:', options: ['Recycling all paper documents', 'Cross-shredding sensitive documents before disposal', 'Using thicker trash bags', 'Emailing documents instead of printing them'], correct: 1, explanation: 'Cross-shredding renders sensitive documents unreadable and impractical to reconstruct.' },
		{ q: 'A watering hole attack works by:', options: ['Sending phishing emails to everyone in a company', 'Compromising a website that a specific target group already trusts and visits', 'Calling random phone numbers', 'Leaving USB drives in parking lots'], correct: 1, explanation: 'Watering hole attacks target trusted resources of a specific group rather than attacking individuals directly.' },
		{ q: 'Pretexting relies on:', options: ['A fabricated but plausible scenario to manipulate someone', 'Brute-force password guessing', 'Physical malware installation only', 'Publicly available data breaches'], correct: 0, explanation: 'Pretexting is defined by an invented, believable story used to extract information or actions.' },
		{ q: 'If someone asks you to relay a one-time verification code sent to your phone, you should:', options: ['Read it to them since they say they need it to help you', 'Never share it — one-time codes verify your identity to systems, not to people', 'Share it only if they sound official', 'Text it to a friend for advice'], correct: 1, explanation: 'One-time codes are meant to authenticate you to a system; anyone asking you to relay one is attempting account takeover.' },
		{ q: 'Impersonation attacks are best mitigated by:', options: ['Trusting uniforms and titles at face value', 'Independently verifying identity and appointments through official channels', 'Allowing all visitors immediate access to save time', 'Avoiding all vendor visits entirely'], correct: 1, explanation: 'Uniforms and titles are easy to fake; independent verification through official channels is the real control.' },
		{ q: 'Business Email Compromise (BEC) most commonly targets:', options: ['Personal social media accounts', 'Vendor payments, payroll, and wire transfers', 'Public Wi-Fi networks', 'Video game accounts'], correct: 1, explanation: 'BEC schemes typically aim at redirecting real business payments to attacker-controlled accounts.' },
		{ q: 'A sudden email requesting updated banking details right before a real invoice is due should be:', options: ['Processed quickly to stay on schedule', 'Verified via a previously known phone number before any change is made', 'Ignored completely', 'Forwarded to the whole finance team'], correct: 1, explanation: 'Verifying through an independent, previously known channel is the standard defense against BEC banking-detail fraud.' },
		{ q: 'A genuine antivirus/OS alert about an infection would:', options: ['Instruct you to call a phone number shown in a browser popup', 'Never ask you to call a phone number to resolve it', 'Ask for your credit card number', 'Require you to keep the browser open indefinitely'], correct: 1, explanation: 'Real system-level security alerts do not route you to call a phone number via a browser popup.' },
		{ q: 'A "you won a giveaway" social media message asking for card details to cover shipping is most likely:', options: ['A legitimate promotion', 'A scam designed to harvest payment information', 'A customer service message', 'A software update notice'], correct: 1, explanation: 'Unsolicited "you won" messages requesting payment details are a common way to harvest card data.' },
		{ q: 'A key emotional pattern in romance scams is:', options: ['Slow, cautious relationship building over many months before any money is mentioned', 'Rapid intimacy followed by requests for money before ever meeting in person', 'Refusal to communicate at all', 'Immediate requests to meet in a public place'], correct: 1, explanation: 'Romance scams typically accelerate emotional closeness quickly and introduce money requests before any in-person meeting.' },
		{ q: 'AI deepfake-enabled social engineering is concerning mainly because:', options: ['It makes phishing emails longer', 'It can convincingly mimic a real person\'s voice or face to add false credibility to a request', 'It only works on video games', 'It replaces the need for any request at all'], correct: 1, explanation: 'Deepfakes add a powerful, convincing layer of false credibility to otherwise standard social engineering asks.' },
		{ q: 'The best overall defense against social engineering is to:', options: ['Trust anyone who sounds confident', 'Verify unusual or high-stakes requests through an independent, known channel', 'Only use email for communication', 'Disable all security software'], correct: 1, explanation: 'Independent verification is the common thread that defeats nearly every social engineering technique in this simulator.' },
		{ q: 'Multi-factor authentication (MFA) helps against phishing because:', options: ['It makes emails load faster', 'A stolen password alone is not enough to access the account', 'It blocks all incoming email', 'It removes the need for passwords entirely'], correct: 1, explanation: 'MFA adds a second proof of identity, so a phished password alone usually isn\'t sufficient for account access.' },
		{ q: 'Which is a legitimate reason to be suspicious of an email even if the sender name looks correct?', options: ['The sender used a signature', 'The domain doesn\'t match the real organization\'s known domain', 'The email was sent during business hours', 'The email contains an attachment icon'], correct: 1, explanation: 'Display names can be spoofed easily; the actual domain is a more reliable signal to check.' },
		{ q: 'Why do attackers often create artificial urgency (deadlines, threats)?', options: ['To make emails shorter', 'To reduce the victim\'s time to think critically or verify the request', 'To comply with email regulations', 'To make the message look more professional'], correct: 1, explanation: 'Urgency is a deliberate pressure tactic to short-circuit careful evaluation and verification.' },
		{ q: 'What is the safest way to handle an unexpected request for sensitive data, even from a seemingly known contact?', options: ['Comply immediately to be helpful', 'Verify through a separate, previously established channel first', 'Ask a coworker to decide for you', 'Ignore it and hope it goes away'], correct: 1, explanation: 'Out-of-band verification is the consistent, reliable defense across virtually every social engineering scenario.' },
		{ q: 'Why should you avoid discussing passwords or codes aloud in public spaces?', options: ['It is against email etiquette', 'Nearby people can overhear and capture sensitive information (shoulder surfing / eavesdropping)', 'It uses too much phone battery', 'It is only a concern in call centers'], correct: 1, explanation: 'Speaking sensitive information aloud in public exposes it to anyone within earshot.' },
		{ q: 'A visitor without a badge insists they have an urgent meeting and asks to be let into a secure area. The correct response is to:', options: ['Let them in to avoid seeming rude', 'Direct them to reception/security for proper visitor verification', 'Ask a nearby stranger to vouch for them', 'Ignore the request entirely without addressing it'], correct: 1, explanation: 'Routing through official reception/visitor verification protects against both tailgating and impersonation attempts.' }
	];

	/* ------------------------------------------------------------
		 6. BADGES
		 ------------------------------------------------------------ */
	const BADGES = [
		{ id: 'first-steps', icon: '🥾', name: 'First Steps', desc: 'Complete your first module', check: s => Object.keys(s.moduleResults).length >= 1 },
		{ id: 'halfway', icon: '🧭', name: 'Halfway There', desc: 'Complete 10 modules', check: s => Object.keys(s.moduleResults).length >= 10 },
		{ id: 'perimeter-defender', icon: '🛡️', name: 'Perimeter Defender', desc: 'Complete all 20 modules', check: s => Object.keys(s.moduleResults).length >= 20 },
		{ id: 'sharp-eye', icon: '🦅', name: 'Sharp Eye', desc: 'Score 100% on any module', check: s => Object.values(s.moduleResults).some(r => r.total > 0 && r.correct === r.total) },
		{ id: 'streak-5', icon: '🔥', name: 'On a Roll', desc: 'Get a 5-answer streak', check: s => s.bestStreak >= 5 },
		{ id: 'streak-10', icon: '⚡', name: 'Unbroken', desc: 'Get a 10-answer streak', check: s => s.bestStreak >= 10 },
		{ id: 'quiz-passed', icon: '🎓', name: 'Certified', desc: 'Pass the final assessment (70%+)', check: s => s.quizAttempts.some(a => a.pct >= 70) },
		{ id: 'quiz-perfect', icon: '👑', name: 'Perfect Perimeter', desc: 'Score 100% on the final assessment', check: s => s.quizAttempts.some(a => a.pct === 100) },
		{ id: 'century', icon: '💯', name: 'Century Club', desc: 'Earn 200 XP', check: s => s.xp >= 200 },
	];

	function checkBadges() {
		let newlyEarned = null;
		BADGES.forEach(b => {
			if (!STATE.badgesEarned.has(b.id) && b.check(STATE)) {
				STATE.badgesEarned.add(b.id);
				newlyEarned = b;
			}
		});
		renderBadges();
		if (newlyEarned) showToast(`Badge earned: ${newlyEarned.name}`, newlyEarned.icon);
	}

	/* ============================================================
		 7. NAVIGATION
		 ============================================================ */
	function navigate(viewId) {
		qsa('.view').forEach(v => v.classList.remove('active'));
		const target = qs('#view-' + viewId);
		if (target) target.classList.add('active');
		qsa('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.nav === viewId));
		window.scrollTo({ top: 0, behavior: STATE.settings.anim ? 'smooth' : 'auto' });
		qs('.nav-links').classList.remove('open');
		if (viewId === 'analytics') renderAnalytics();
	}
	document.addEventListener('click', (e) => {
		const navBtn = e.target.closest('[data-nav]');
		if (navBtn) { navigate(navBtn.dataset.nav); }
	});
	qs('#nav-burger').addEventListener('click', () => qs('.nav-links').classList.toggle('open'));

	/* ============================================================
		 8. DASHBOARD RENDERING
		 ============================================================ */
	let currentRiskFilter = 'all';

	function renderDashboard() {
		const grid = qs('#module-grid');
		grid.innerHTML = '';
		const filtered = MODULES.filter(m => currentRiskFilter === 'all' || m.risk === currentRiskFilter);
		filtered.forEach(m => {
			const done = STATE.moduleResults[m.id] && STATE.moduleResults[m.id].done;
			const card = el('div', 'module-card' + (done ? ' done' : ''));
			card.innerHTML = `
      <div class="module-top">
        <span class="module-icon">${m.icon}</span>
        ${done ? `<span class="module-done-badge">✓ ${STATE.moduleResults[m.id].correct}/${STATE.moduleResults[m.id].total}</span>` : ''}
      </div>
      <h3>${esc(m.name)}</h3>
      <p>${esc(m.desc)}</p>
      <div class="module-tags">
        <span class="tag">${esc(m.difficulty)}</span>
        <span class="tag tag-risk-${m.risk}">${esc(m.risk)} risk</span>
      </div>
      <button class="btn btn-primary module-launch" data-launch="${m.id}">${done ? 'Replay' : 'Launch'} Simulator</button>
    `;
			grid.appendChild(card);
		});
		const completeCount = Object.keys(STATE.moduleResults).filter(id => STATE.moduleResults[id].done).length;
		qs('#dash-progress-label').textContent = `${completeCount} / ${MODULES.length} modules complete`;
		qs('#dash-progress-fill').style.width = (completeCount / MODULES.length * 100) + '%';
	}
	qs('#module-grid').addEventListener('click', e => {
		const btn = e.target.closest('[data-launch]');
		if (btn) startModule(btn.dataset.launch);
	});
	qs('#risk-filters').addEventListener('click', e => {
		const btn = e.target.closest('.filter-chip');
		if (!btn) return;
		currentRiskFilter = btn.dataset.risk;
		qsa('.filter-chip').forEach(c => c.classList.toggle('active', c === btn));
		renderDashboard();
	});

	/* ============================================================
		 9. SIMULATOR PLAYER ENGINE
		 ============================================================ */
	const sim = { moduleId: null, order: [], idx: 0, correct: 0, answered: false };

	function startModule(id) {
		const mod = MODULES.find(m => m.id === id);
		if (!mod) return;
		sim.moduleId = id;
		sim.order = mod.scenarios.map((_, i) => i);
		sim.idx = 0;
		sim.correct = 0;
		sim.answered = false;

		qs('#sim-icon').textContent = mod.icon;
		qs('#sim-title').textContent = mod.name;
		qs('#sim-difficulty').textContent = mod.difficulty;
		qs('#sim-risk').textContent = mod.risk + ' risk';
		qs('#sim-risk').className = 'tag tag-risk-' + mod.risk;
		qs('#sim-total').textContent = mod.scenarios.length;
		navigate('sim');
		renderScenario();
	}

	function currentModule() { return MODULES.find(m => m.id === sim.moduleId); }

	function renderScenario() {
		const mod = currentModule();
		const scenario = mod.scenarios[sim.order[sim.idx]];
		sim.answered = false;
		qs('#sim-score').textContent = sim.correct;
		qs('#sim-progress-fill').style.width = (sim.idx / mod.scenarios.length * 100) + '%';
		qs('#sim-tip').hidden = true;
		qs('#sim-next').disabled = true;
		qs('#sim-next').textContent = (sim.idx === mod.scenarios.length - 1) ? 'See Results →' : 'Next →';

		const body = qs('#sim-body');
		body.innerHTML = '';
		body.appendChild(renderScenarioContent(scenario));

		const promptEl = el('div', 'scenario-prompt', esc(scenario.question));
		body.appendChild(promptEl);

		const list = el('div', 'options-list');
		scenario.options.forEach((opt, i) => {
			const b = el('button', 'option-btn');
			b.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${esc(opt.text)}</span>`;
			b.addEventListener('click', () => answerScenario(scenario, opt, b, list));
			list.appendChild(b);
		});
		body.appendChild(list);
	}

	function renderScenarioContent(s) {
		const wrap = el('div');
		if (s.type === 'email') {
			wrap.innerHTML = `
      <div class="sim-email">
        <div class="sim-email-head">
          <div class="row"><span class="label">From:</span><span>${esc(s.from)}</span></div>
          <div class="row"><span class="label">To:</span><span>${esc(s.to)}</span></div>
        </div>
        <div class="sim-email-subject">${esc(s.subject)}</div>
        <div class="sim-email-body">${esc(s.body)}</div>
      </div>`;
		} else if (s.type === 'sms') {
			wrap.innerHTML = `
      <div class="sim-phone">
        <div class="sim-phone-bar">${esc(s.appLabel)}</div>
        ${s.messages.map(m => `<div class="bubble bubble-${m.from === 'in' ? 'in' : 'out'}">${esc(m.text)}</div>`).join('')}
      </div>`;
		} else if (s.type === 'website') {
			wrap.innerHTML = `
      <div class="sim-browser">
        <div class="sim-browser-bar"><div class="sim-browser-dots"><span></span><span></span><span></span></div><div class="sim-browser-url">${esc(s.url)}</div></div>
        <div class="sim-browser-body">${esc(s.bodyText)}</div>
      </div>`;
		} else if (s.type === 'popup') {
			wrap.innerHTML = `
      <div class="sim-popup"><h4>${esc(s.heading)}</h4><p style="margin:0;color:var(--text-dim)">${esc(s.body)}</p></div>`;
		} else if (s.type === 'social') {
			wrap.innerHTML = `
      <div class="sim-social">
        <div class="sim-social-head"><div class="sim-social-avatar"></div><div><div><strong>${esc(s.platform)}</strong></div><div class="sim-social-handle">${esc(s.handle)}</div></div></div>
        <div>${esc(s.postText)}</div>
      </div>`;
		} else if (s.type === 'qr') {
			wrap.innerHTML = `<div class="sim-qr">${makeFakeQR(s.context)}</div><p style="text-align:center">${esc(s.context)}</p>`;
		} else { // scene
			wrap.innerHTML = `<div class="sim-scene">${s.tag ? `<span class="scene-tag">${esc(s.tag)}</span>` : ''}${esc(s.text)}</div>`;
		}
		return wrap;
	}

	function answerScenario(scenario, opt, btnEl, listEl) {
		if (sim.answered) return;
		sim.answered = true;
		const correctOpt = scenario.options.find(o => o.correct);
		qsa('.option-btn', listEl).forEach((b, i) => {
			b.disabled = true;
			if (scenario.options[i].correct) b.classList.add('correct');
		});
		if (!opt.correct) btnEl.classList.add('incorrect');

		if (opt.correct) sim.correct++;
		registerAnswer(sim.moduleId, opt.correct);
		qs('#sim-score').textContent = sim.correct;

		const tip = qs('#sim-tip');
		tip.hidden = false;
		tip.className = 'tip-box ' + (opt.correct ? 'correct' : 'wrong');
		let flagsHtml = '';
		if (scenario.redFlags && scenario.redFlags.length) {
			flagsHtml = `<ul style="margin:8px 0 0;padding-left:18px">${scenario.redFlags.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`;
		}
		tip.innerHTML = `<strong>${opt.correct ? '✅ Correct' : '❌ Not quite'}</strong>${esc(scenario.explanation)}${flagsHtml}`;
		qs('#sim-next').disabled = false;
	}

	qs('#sim-next').addEventListener('click', () => {
		const mod = currentModule();
		if (sim.idx < mod.scenarios.length - 1) {
			sim.idx++;
			renderScenario();
		} else {
			finishModule();
		}
	});
	qs('#sim-restart').addEventListener('click', () => startModule(sim.moduleId));

	function finishModule() {
		const mod = currentModule();
		const total = mod.scenarios.length;
		const pct = Math.round((sim.correct / total) * 100);
		STATE.moduleResults[mod.id] = { correct: sim.correct, total, done: true };
		STATE.accuracyHistory.push({ label: mod.name, pct });
		addXP(20); // completion bonus

		qs('#summary-icon').textContent = pct >= 80 ? '🏆' : pct >= 50 ? '🎯' : '📘';
		qs('#summary-title').textContent = mod.name;
		qs('#summary-detail').textContent = `You answered ${sim.correct} of ${total} correctly.`;
		qs('#summary-pct').textContent = pct + '%';
		qs('#summary-xp').textContent = 20 + sim.correct * 10;
		const circumference = 326;
		const ring = qs('#summary-ring');
		ring.style.strokeDasharray = circumference;
		ring.style.strokeDashoffset = circumference;
		requestAnimationFrame(() => { ring.style.strokeDashoffset = circumference - (circumference * pct / 100); });

		navigate('summary');
		renderDashboard();
	}
	qs('#summary-retry').addEventListener('click', () => startModule(sim.moduleId));

	/* ============================================================
		 10. LEARNING CENTER
		 ============================================================ */
	function renderLearningCenter() {
		const nav = qs('#learning-nav');
		nav.innerHTML = '';
		MODULES.forEach((m, i) => {
			const b = el('button', 'learning-nav-item' + (i === 0 ? ' active' : ''));
			b.innerHTML = `<span>${m.icon}</span><span>${esc(m.name)}</span>`;
			b.dataset.mid = m.id;
			nav.appendChild(b);
		});
		showLearningTopic(MODULES[0].id);
	}
	qs('#learning-nav').addEventListener('click', e => {
		const b = e.target.closest('.learning-nav-item');
		if (!b) return;
		qsa('.learning-nav-item').forEach(x => x.classList.toggle('active', x === b));
		showLearningTopic(b.dataset.mid);
	});
	function showLearningTopic(id) {
		const mod = MODULES.find(m => m.id === id);
		const L = LEARNING[id];
		const content = qs('#learning-content');
		content.innerHTML = `
    <div class="learning-panel">
      <div class="eyebrow">${esc(mod.difficulty.toUpperCase())} · ${esc(mod.risk.toUpperCase())} RISK</div>
      <h2>${mod.icon} ${esc(mod.name)}</h2>
      <div class="learning-block"><h4>Definition</h4><p>${esc(L.definition)}</p></div>
      <div class="learning-block"><h4>Real-world style example</h4><p>${esc(L.example)}</p></div>
      <div class="learning-block"><h4>Red flags</h4><ul>${L.redFlags.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
      <div class="learning-block"><h4>Prevention techniques</h4><ul>${L.prevention.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
      <div class="learning-block">
        <h4>Do's &amp; Don'ts</h4>
        <div class="dodont-grid">
          <div class="dodont-col dos"><h5>✅ Do</h5><ul>${L.dos.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
          <div class="dodont-col donts"><h5>🚫 Don't</h5><ul>${L.donts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
        </div>
      </div>
      <button class="btn btn-primary learning-quiz-btn" data-launch-from-learning="${mod.id}">Take the ${esc(mod.name)} Quiz</button>
    </div>`;
	}
	qs('#learning-content').addEventListener('click', e => {
		const b = e.target.closest('[data-launch-from-learning]');
		if (b) startModule(b.dataset.launchFromLearning);
	});

	/* ============================================================
		 11. GLOBAL QUIZ
		 ============================================================ */
	const quiz = { questions: [], idx: 0, correct: 0, answered: false };

	qs('#quiz-start-btn').addEventListener('click', startGlobalQuiz);
	function startGlobalQuiz() {
		quiz.questions = shuffle(QUIZ_BANK).slice(0, 30).map(q => ({
			...q,
			shuffledOptions: shuffleOptions(q.options, q.correct)
		}));
		quiz.idx = 0; quiz.correct = 0;
		navigate('quiz');
		renderQuizQuestion();
	}
	function shuffleOptions(options, correctIdx) {
		const withFlag = options.map((text, i) => ({ text, correct: i === correctIdx }));
		return shuffle(withFlag);
	}
	function renderQuizQuestion() {
		quiz.answered = false;
		const q = quiz.questions[quiz.idx];
		qs('#quiz-qnum').textContent = `Question ${quiz.idx + 1} / ${quiz.questions.length}`;
		qs('#quiz-score').textContent = quiz.correct;
		qs('#quiz-answered').textContent = quiz.idx;
		qs('#quiz-progress-fill').style.width = (quiz.idx / quiz.questions.length * 100) + '%';
		qs('#quiz-tip').hidden = true;
		qs('#quiz-next').disabled = true;
		qs('#quiz-next').textContent = quiz.idx === quiz.questions.length - 1 ? 'See Certificate →' : 'Next →';

		const body = qs('#quiz-body');
		body.innerHTML = '';
		body.appendChild(el('div', 'scenario-prompt', esc(q.q)));
		const list = el('div', 'options-list');
		q.shuffledOptions.forEach((opt, i) => {
			const b = el('button', 'option-btn');
			b.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${esc(opt.text)}</span>`;
			b.addEventListener('click', () => answerQuiz(q, opt, b, list));
			list.appendChild(b);
		});
		body.appendChild(list);
	}
	function answerQuiz(q, opt, btnEl, listEl) {
		if (quiz.answered) return;
		quiz.answered = true;
		qsa('.option-btn', listEl).forEach((b, i) => {
			b.disabled = true;
			if (q.shuffledOptions[i].correct) b.classList.add('correct');
		});
		if (!opt.correct) btnEl.classList.add('incorrect');
		if (opt.correct) { quiz.correct++; addXP(15); playTone(880, 0.15); }
		else playTone(160, 0.22);
		qs('#quiz-score').textContent = quiz.correct;

		const tip = qs('#quiz-tip');
		tip.hidden = false;
		tip.className = 'tip-box ' + (opt.correct ? 'correct' : 'wrong');
		tip.innerHTML = `<strong>${opt.correct ? '✅ Correct' : '❌ Not quite'}</strong>${esc(q.explanation)}`;
		qs('#quiz-next').disabled = false;
	}
	qs('#quiz-next').addEventListener('click', () => {
		if (quiz.idx < quiz.questions.length - 1) { quiz.idx++; renderQuizQuestion(); }
		else finishGlobalQuiz();
	});
	function gradeFor(pct) {
		if (pct >= 97) return 'A+'; if (pct >= 93) return 'A'; if (pct >= 90) return 'A-';
		if (pct >= 87) return 'B+'; if (pct >= 80) return 'B'; if (pct >= 70) return 'C';
		return 'D';
	}
	function finishGlobalQuiz() {
		const pct = Math.round((quiz.correct / quiz.questions.length) * 100);
		const grade = gradeFor(pct);
		STATE.quizAttempts.push({ pct, grade });
		STATE.accuracyHistory.push({ label: 'Final Assessment', pct });
		qs('#cert-grade').textContent = grade;
		qs('#cert-score').textContent = `${quiz.correct}/${quiz.questions.length} correct — ${pct}%`;
		qs('#cert-date').textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
		checkBadges();
		navigate('cert');
	}
	qs('#cert-retry').addEventListener('click', startGlobalQuiz);

	/* ============================================================
		 12. ANALYTICS
		 ============================================================ */
	function renderAnalytics() {
		const completed = Object.keys(STATE.moduleResults).length;
		qs('#an-completed').textContent = completed;
		qs('#an-accuracy').textContent = STATE.totalAnswered ? Math.round(STATE.totalCorrect / STATE.totalAnswered * 100) + '%' : '0%';
		qs('#an-wrong').textContent = STATE.totalAnswered - STATE.totalCorrect;
		qs('#an-xp').textContent = STATE.xp;

		drawProgressChart();
		renderWeakAreas();
		renderBadges();
	}

	function drawProgressChart() {
		const canvas = qs('#chart-progress');
		const ctx = canvas.getContext('2d');
		const w = canvas.width, h = canvas.height;
		ctx.clearRect(0, 0, w, h);
		const data = STATE.accuracyHistory;
		const styles = getComputedStyle(document.body);
		const textColor = styles.getPropertyValue('--text-faint').trim() || '#6b7690';
		const lineColor = styles.getPropertyValue('--cyan').trim() || '#2dd8f0';
		const gridColor = 'rgba(255,255,255,0.08)';

		ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
		for (let i = 0; i <= 4; i++) {
			const y = 20 + (h - 50) * (i / 4);
			ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w - 10, y); ctx.stroke();
			ctx.fillStyle = textColor; ctx.font = '11px monospace';
			ctx.fillText((100 - i * 25) + '%', 6, y + 4);
		}
		if (data.length === 0) {
			ctx.fillStyle = textColor; ctx.font = '13px sans-serif';
			ctx.fillText('Complete a module or the final assessment to see progress here.', 50, h / 2);
			return;
		}
		const padLeft = 40, padRight = 10, padTop = 20, padBottom = 30;
		const plotW = w - padLeft - padRight;
		const plotH = h - padTop - padBottom;
		ctx.beginPath();
		ctx.strokeStyle = lineColor; ctx.lineWidth = 2.5;
		data.forEach((d, i) => {
			const x = padLeft + (data.length === 1 ? 0 : (plotW * i / (data.length - 1)));
			const y = padTop + plotH * (1 - d.pct / 100);
			if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
		});
		ctx.stroke();
		data.forEach((d, i) => {
			const x = padLeft + (data.length === 1 ? 0 : (plotW * i / (data.length - 1)));
			const y = padTop + plotH * (1 - d.pct / 100);
			ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
			ctx.fillStyle = lineColor; ctx.fill();
		});
	}

	function renderWeakAreas() {
		const wrap = qs('#weak-areas-list');
		wrap.innerHTML = '';
		const entries = Object.entries(STATE.moduleResults)
			.map(([id, r]) => ({ id, name: (MODULES.find(m => m.id === id) || {}).name || id, pct: r.total ? Math.round(r.correct / r.total * 100) : 0 }))
			.filter(e => e.pct < 80)
			.sort((a, b) => a.pct - b.pct);
		if (entries.length === 0) {
			wrap.appendChild(el('div', 'weak-empty', 'No weak areas yet — complete a few modules to see targeted feedback here.'));
			return;
		}
		entries.forEach(e => {
			const row = el('div', 'weak-item');
			row.innerHTML = `<span>${esc(e.name)}</span><div class="wbar"><div class="wfill" style="width:${e.pct}%"></div></div><span>${e.pct}%</span>`;
			wrap.appendChild(row);
		});
	}

	function renderBadges() {
		const grid = qs('#badge-grid');
		if (!grid) return;
		grid.innerHTML = '';
		BADGES.forEach(b => {
			const earned = STATE.badgesEarned.has(b.id);
			const card = el('div', 'badge' + (earned ? ' earned' : ''));
			card.innerHTML = `<div class="badge-icon">${b.icon}</div><div class="badge-name">${esc(b.name)}</div><div class="badge-desc">${esc(b.desc)}</div>`;
			grid.appendChild(card);
		});
	}

	/* ============================================================
		 13. SETTINGS
		 ============================================================ */
	function bindToggle(id, key, onChange) {
		const btn = qs(id);
		btn.addEventListener('click', () => {
			const now = btn.dataset.on !== 'true';
			btn.dataset.on = now;
			STATE.settings[key] = now;
			if (onChange) onChange(now);
		});
	}
	bindToggle('#toggle-theme', 'theme_on', (on) => {
		document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
		STATE.settings.theme = on ? 'dark' : 'light';
	});
	bindToggle('#toggle-sound', 'sound', (on) => { STATE.settings.sound = on; });
	bindToggle('#toggle-anim', 'anim', (on) => {
		STATE.settings.anim = on;
		document.body.classList.toggle('no-anim', !on);
	});
	qs('#reset-progress').addEventListener('click', () => {
		STATE.xp = 0; STATE.streak = 0; STATE.bestStreak = 0; STATE.moduleResults = {};
		STATE.totalAnswered = 0; STATE.totalCorrect = 0; STATE.accuracyHistory = []; STATE.quizAttempts = [];
		STATE.badgesEarned = new Set();
		qs('#nav-xp').textContent = 0; qs('#nav-level').textContent = 1; qs('#nav-streak').textContent = 0;
		renderDashboard(); renderBadges();
		showToast('Progress reset for this session', '♻️');
	});

	/* ============================================================
		 14. BACKGROUND PARTICLE CANVAS
		 ============================================================ */
	(function bgParticles() {
		const canvas = qs('#bg-canvas');
		const ctx = canvas.getContext('2d');
		let particles = [];
		function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
		resize();
		window.addEventListener('resize', resize);
		const count = Math.min(70, Math.floor(window.innerWidth / 22));
		for (let i = 0; i < count; i++) {
			particles.push({
				x: Math.random() * canvas.width, y: Math.random() * canvas.height,
				vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
				r: Math.random() * 1.6 + 0.4
			});
		}
		function tick() {
			if (STATE.settings.anim) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				particles.forEach(p => {
					p.x += p.vx; p.y += p.vy;
					if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
					if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
					ctx.beginPath();
					ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
					ctx.fillStyle = 'rgba(77,125,255,0.5)';
					ctx.fill();
				});
				for (let i = 0; i < particles.length; i++) {
					for (let j = i + 1; j < particles.length; j++) {
						const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist < 110) {
							ctx.strokeStyle = `rgba(45,216,240,${0.12 * (1 - dist / 110)})`;
							ctx.lineWidth = 1;
							ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y); ctx.stroke();
						}
					}
				}
			}
			requestAnimationFrame(tick);
		}
		tick();
	})();

	/* ============================================================
		 15. LANDING STAT COUNTERS
		 ============================================================ */
	function animateCounters() {
		qsa('.stat-num').forEach(node => {
			const target = parseFloat(node.dataset.count);
			const decimal = node.dataset.decimal ? parseInt(node.dataset.decimal, 10) : 0;
			const duration = 1400;
			const start = performance.now();
			function frame(now) {
				const t = Math.min(1, (now - start) / duration);
				const eased = 1 - Math.pow(1 - t, 3);
				const val = target * eased;
				node.textContent = decimal ? val.toFixed(1) : Math.round(val);
				if (t < 1) requestAnimationFrame(frame);
				else node.textContent = decimal ? target.toFixed(1) : target;
			}
			requestAnimationFrame(frame);
		});
	}

	/* ============================================================
		 16. INIT
		 ============================================================ */
	function init() {
		renderDashboard();
		renderLearningCenter();
		renderBadges();
		animateCounters();

		setTimeout(() => { qs('#loader').classList.add('hide'); }, 900);
	}
	document.addEventListener('DOMContentLoaded', init);

})();