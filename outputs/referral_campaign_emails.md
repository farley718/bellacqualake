# Bell Acqua Lake — Referral Program Emails

This file contains the email draft to Mike (explaining the affiliate system under the hood) and the updated promotional HTML email template to send to existing customers.

---

## 1. Explanation Email to Mike

**Subject:** How the New Bell Acqua Affiliate Referral Program Works under the Hood

Hi Mike,

We have officially launched the new Affiliate Referral Program for Bell Acqua Lake! The system is fully live, and the automated email notifications are wired up in GoHighLevel.

Here is a quick breakdown of how the loop works for you, your staff, and your customers:

### 1. Customer Joins the Program
* Customers visit the new **Affiliate Portal**: `https://meek-duckanoo-53e84b.netlify.app/bell-acqua-affiliate.html`
* They enter their Name and Email (no password required).
* The system instantly generates:
  * A unique code (e.g., `MIKE-7F2K`).
  * A shareable booking link (e.g., `?ref=MIKE-7F2K`).
  * A personal, secure dashboard showing how many friends they’ve referred and their earned credits.

### 2. The Friend Books
* When a friend clicks the sharing link, it opens the normal booking page and automatically fills in the **"Referral Code"** box at the top.
* The system instantly applies a **20% discount** to their cart for their first booking.
* The system has built-in guards to prevent self-referrals or duplicate claims on the same email.

### 3. The Affiliate Gets Paid (Credit Coupon)
* Once the friend completes checkout, the database automatically:
  * Generates a unique **20% credit coupon** (e.g., `CREDIT-XXXXXX`) for the person who referred them.
  * Fires a webhook to **GoHighLevel**.
* GHL catches this webhook and automatically sends the affiliate an email showing their unique `CREDIT-XXXXXX` code to redeem on their next booking.

### 4. Admin & Staff Tracking
* On the **Staff Dashboard** (`bell-acqua-staff.html`), there is a new **Referrals** tab.
* You and your drivers can see a full list of who is sharing links, who has earned credits, and whether those credits have been redeemed yet.
* You can also manually toggle affiliates active/inactive from here.

This creates a self-sustaining marketing loop that incentivizes your regulars to bring in new skiers, with all discount code creation and tracking handled automatically!

Best,  
John & The Anti-Gravity Team

---

## 2. Customer Promotional Email (HTML)

This email replaces the old "Comeback" email with an exciting invite to join the new referral program. It retains the exact HTML structure, branding logo, and hero image, but updates the messaging to drive customers to generate their sharing links.

```html
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7f9; padding: 20px 0;">
    <tr>
        <td align="center">
            <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e1e8ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; text-align: left; overflow: hidden;">
                <!-- Header Logo -->
                <tr>
                    <td align="center" style="padding: 25px 20px 20px 20px; border-bottom: 1px solid #f0f4f8;">
                        <img src="https://bellacqualake.com/wp-content/uploads/2024/01/cropped-BellAcquaLakeLogo_800px.png" alt="Bell Acqua Lake Logo" width="190" style="display: block; width: 190px; max-width: 100%; height: auto;">
                    </td>
                </tr>
                <!-- Hero Banner Image -->
                <tr>
                    <td align="center" style="padding: 0;">
                        <img src="https://assets.cdn.filesafe.space/rqN9GeQaEfpisadTVaUO/media/69f8b3596f6468fa02132977.png" alt="Waterskiing at Bell Acqua Lake" width="600" style="display: block; width: 100%; max-width: 600px; height: auto;">
                    </td>
                </tr>
                <!-- Body Content -->
                <tr>
                    <td style="padding: 30px; color: #2c3e50; font-size: 15px; line-height: 1.7;">
                        <h2 style="color: #002b49; font-size: 22px; margin-top: 0; margin-bottom: 14px; font-weight: 700;">Share the Water. Earn Free Ski Runs! 🏄‍♂️</h2>
                        <p style="margin: 0 0 15px 0;">Hi {{contact.first_name}},</p>
                        <p style="margin: 0 0 15px 0;">Prisinte glassy mornings, perfect conditions, and custom pulls—skiing is always better with friends. So we figured it's time to reward you for sharing the love of the lake!</p>
                        
                        <p style="margin: 0 0 15px 0;">We’ve just launched the official <strong>Bell Acqua Lake Referral Program</strong>. It's our way of saying thank you for growing the best water skiing community in Sacramento.</p>

                        <!-- Offer Callout Box -->
                        <div style="background-color: #f0f7ff; border: 1px dashed #0077b6; border-radius: 8px; padding: 22px; text-align: center; margin: 25px 0;">
                            <span style="display: inline-block; background-color: #e5a93b; color: #ffffff; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 4px 12px; border-radius: 20px; margin-bottom: 10px;">The Double-Sided Reward</span>
                            <div style="font-size: 24px; font-weight: bold; color: #002b49; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 6px 0;">GIVE 20%, GET 20%</div>
                            <p style="margin: 6px 0 0 0; font-size: 15px; color: #2c3e50;">
                                Friends get <strong style="color: #0077b6;">20% off</strong> their first booking, and <strong style="color: #0077b6;">YOU get 20% off</strong> for every friend who books!
                            </p>
                        </div>

                        <p style="margin: 0 0 10px 0;"><strong>How It Works (In 3 Simple Steps):</strong></p>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                            <tr>
                                <td width="24" valign="top" style="color: #0077b6; font-weight: bold; font-size: 16px;">1.</td>
                                <td style="padding-bottom: 10px; color: #2c3e50; font-size: 14px;"><strong>Grab your unique link</strong> in 5 seconds at <a href="https://meek-duckanoo-53e84b.netlify.app/bell-acqua-affiliate.html" style="color: #0077b6; text-decoration: none;; mso-style-textfill-fill-color: #0077b6;"><!--[if mso]><font color="#0077b6"><![endif]-->our Affiliate Portal<!--[if mso]></font><![endif]--></a> (no passwords required).</td>
                            </tr>
                            <tr>
                                <td width="24" valign="top" style="color: #0077b6; font-weight: bold; font-size: 16px;">2.</td>
                                <td style="padding-bottom: 10px; color: #2c3e50; font-size: 14px;"><strong>Share your link</strong> via text, email, or social media with friends, family, or other riders.</td>
                            </tr>
                            <tr>
                                <td width="24" valign="top" style="color: #0077b6; font-weight: bold; font-size: 16px;">3.</td>
                                <td style="padding-bottom: 10px; color: #2c3e50; font-size: 14px;"><strong>Watch the credits roll in!</strong> As soon as a friend books their first ride, we'll automatically email you a unique <strong>20% off discount code</strong> for your next session.</td>
                            </tr>
                        </table>

                        <!-- CTA Button -->
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                                <td align="center">
                                    <a href="https://meek-duckanoo-53e84b.netlify.app/bell-acqua-affiliate.html" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #0077b6; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 15px; border-radius: 6px; text-align: center;">Get Your Referral Link</a>
                                </td>
                            </tr>
                        </table>

                        <p style="margin: 25px 0 15px 0;">There's no limit to how many credits you can earn. Keep sharing your link, and you can keep skiing for a fraction of the cost all season long!</p>

                        <p style="margin: 0 0 5px 0;">See you back on the lake!</p>
                        <p style="margin: 0; font-weight: bold; color: #002b49;">The Bell Acqua Lake Team</p>

                        <!-- Footer Note -->
                        <div style="background-color: #f8fafc; border-left: 3px solid #0077b6; padding: 12px 15px; margin-top: 25px; border-radius: 4px;">
                            <p style="margin: 0; font-size: 13px; color: #5a6e7f; font-style: italic;">
                                <strong>P.S.</strong> Your dashboard tracks your clicks, referrals, and credits in real time, so you always know exactly how much ski credit you have waiting.
                            </p>
                        </div>
                    </td>
                </tr>
                <!-- Footer -->
                <tr>
                    <td align="center" style="background-color: #f8fafc; padding: 25px 30px; font-size: 12px; color: #8898aa; border-top: 1px solid #edf2f7; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0 0 4px 0; font-weight: bold; color: #2c3e50;">Bell Acqua Lake 1 — Sacramento’s Premier Private Waterskiing Facility</p>
                        <p style="margin: 0 0 4px 0;">Rio Linda, California | <a href="https://bellacqualake.com" style="color: #0077b6; text-decoration: none;; mso-style-textfill-fill-color: #0077b6;"><!--[if mso]><font color="#0077b6"><![endif]-->bellacqualake.com<!--[if mso]></font><![endif]--></a></p>
                        <p style="margin: 8px 0 0 0;"><a href="{{unsubscribe_link}}" style="color: #8898aa; text-decoration: underline;; mso-style-textfill-fill-color: #8898aa;"><!--[if mso]><font color="#8898aa"><![endif]-->Unsubscribe<!--[if mso]></font><![endif]--></a></p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
```
