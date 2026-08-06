import { AuthScreen } from "../../components/auth-screen";
import { authEnabled } from "../../lib/auth-enabled";

export default function SignInPage() {
  return <AuthScreen mode="sign-in" enabled={authEnabled} />;
}
