import { ButtonPrimary, EmptyStateCard, ErrorFeedbackScreen, skinVars } from "@telefonica/mistica";
import IconErrorRegular from "@telefonica/mistica-icons/icon-error-regular";
import * as React from "react";

interface Props {
  children: React.ReactNode;
  /** Shown in the inline fallback, e.g. "Couldn't draw the access map". */
  title?: string;
  /** Replace the whole page instead of just this section. Use once, around the app. */
  fullScreen?: boolean;
}

/**
 * Keeps a rendering bug in one section from blanking the page mid-demo. Sections recover with
 * "Try again"; the app-level boundary offers a reload.
 */
export class ErrorBoundary extends React.Component<Props, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("AccessHound UI error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fullScreen) {
      return (
        <ErrorFeedbackScreen
          title="AccessHound hit a problem"
          description="Reloading usually fixes it. The demo data lives on the server, so nothing is lost."
          errorReference={error.message}
          primaryButton={<ButtonPrimary onPress={() => location.reload()}>Reload</ButtonPrimary>}
        />
      );
    }
    return (
      <EmptyStateCard
        asset={<IconErrorRegular size="100%" color={skinVars.colors.error} />}
        title={this.props.title ?? "Something went wrong here"}
        description={error.message}
        button={
          <ButtonPrimary small onPress={() => this.setState({ error: undefined })}>
            Try again
          </ButtonPrimary>
        }
      />
    );
  }
}
