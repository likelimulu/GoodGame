import { Link } from "react-router-dom";
import Layout from "../components/Layout";

export default function ContentRulesPage() {
  return (
    <Layout>
      <main className="page-grid">
        <section className="hero-card">
          <span className="eyebrow">Platform Governance</span>
          <h1 className="headline">Content Rules</h1>
          <p className="subhead">
            Our community guidelines keep GoodGame a healthy place for every
            player, moderator, and developer.
          </p>
        </section>

        <section className="form-card">
          <p className="panel-tag">Community Standards</p>
          <h2 className="section-title">Rules &amp; Guidelines</h2>

          <div className="rules-list">
            <div className="rule-item">
              <h3 className="rule-title">1. Respect All Members</h3>
              <p className="rule-copy">
                Treat everyone with respect. Harassment, hate speech, personal
                attacks, and discriminatory language of any kind will not be
                tolerated.
              </p>
            </div>

            <div className="rule-item">
              <h3 className="rule-title">2. No Spam or Self-Promotion</h3>
              <p className="rule-copy">
                Do not post spam, excessive self-promotion, or off-topic
                content. Posts should be relevant to the game hub they are
                posted in.
              </p>
            </div>

            <div className="rule-item">
              <h3 className="rule-title">3. Tag Spoilers Appropriately</h3>
              <p className="rule-copy">
                Mark any content containing spoilers using the spoiler tag. This
                applies to story content, unreleased features, and datamined
                information.
              </p>
            </div>

            <div className="rule-item">
              <h3 className="rule-title">4. Original Content Only</h3>
              <p className="rule-copy">
                Do not post content you do not own or have permission to share.
                Give credit where credit is due.
              </p>
            </div>

            <div className="rule-item">
              <h3 className="rule-title">5. No Cheating or Exploits</h3>
              <p className="rule-copy">
                Do not share cheats, hacks, exploits, or instructions for
                abusing game mechanics. Bug reports should go through the
                proper channels.
              </p>
            </div>

            <div className="rule-item">
              <h3 className="rule-title">6. Constructive Feedback</h3>
              <p className="rule-copy">
                Criticism is welcome when it is constructive. Focus on ideas
                and gameplay rather than attacking developers or other players.
              </p>
            </div>

            <div className="rule-item">
              <h3 className="rule-title">7. Report, Don&apos;t Retaliate</h3>
              <p className="rule-copy">
                If you see content that violates these rules, use the report
                button instead of responding in kind. Our moderators will
                review all flagged content.
              </p>
            </div>

            <div className="rule-item">
              <h3 className="rule-title">8. Moderation &amp; Disputes</h3>
              <p className="rule-copy">
                Moderators may warn, remove content, or escalate violations.
                All moderation actions are logged. If you believe a moderation
                decision was made in error, you may contact the admin team for
                review.
              </p>
            </div>
          </div>

          <p className="helper" style={{ marginTop: "18px" }}>
            By using GoodGame, you agree to abide by these rules. Violations
            may result in content removal, reputation penalties, or account
            restrictions.
          </p>

          <div className="action-row" style={{ marginTop: "14px" }}>
            <Link className="btn primary" to="/signup">
              Back to Sign Up
            </Link>
            <Link className="btn ghost" to="/posts">
              Browse Community
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
