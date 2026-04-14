import { useParams } from "react-router-dom";
import Layout from "../../components/Layout";

interface ErrorConfig {
  eyebrow: string;
  headline: string;
  subhead: string;
  helper: string;
}

function getConfig(status: number): ErrorConfig {
  switch (status) {
    case 400:
      return {
        eyebrow: "Arcade Garage",
        headline: "Bad Request",
        subhead: "Double-check your input and try again.",
        helper: "The server couldn't process what you sent.",
      };
    case 403:
      return {
        eyebrow: "Arcade Garage",
        headline: "Off Limits",
        subhead: "You don't have permission to be here.",
        helper: "Contact your team if you think this is a mistake.",
      };
    case 404:
      return {
        eyebrow: "Arcade Garage",
        headline: "Skill Issue?",
        subhead: "There's an error on our end — try reloading!",
        helper: "We have run into an error trying to retrieve the page.",
      };
    case 500:
    default:
      return {
        eyebrow: "Arcade Garage",
        headline: "Server Down?",
        subhead: "Something broke on our end — hang tight.",
        helper: "Try refreshing or come back later.",
      };
  }
}

export default function ErrorPage({ status: statusProp }: { status?: number }) {
  const { status: statusParam } = useParams<{ status?: string }>();
  const status = statusProp ?? (statusParam ? parseInt(statusParam, 10) : 404);
  const config = getConfig(status);

  return (
    <Layout>
      <div className="page-grid">
        <div className="hero-card">
          <span className="eyebrow">{config.eyebrow}</span>
          <h1 className="headline">{config.headline}</h1>
          <p className="subhead">{config.subhead}</p>
        </div>
        <div className="form-card">
          <p className="panel-tag">Game Hubs</p>
          <p className="error-404">{status}</p>
          <p className="helper">{config.helper}</p>
        </div>
      </div>
    </Layout>
  );
}
