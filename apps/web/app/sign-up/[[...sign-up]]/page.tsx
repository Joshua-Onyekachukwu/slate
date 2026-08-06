import { AuthScreen } from "../../components/auth-screen";
import { authEnabled } from "../../lib/auth-enabled";

export default function SignUpPage() {
  return <AuthScreen mode="sign-up" enabled={authEnabled} />;
}
