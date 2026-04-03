<script lang="ts">
  let email = $state("");
  let password = $state("");

  async function handleLogin() {
    // TODO: implement login API call
    console.log("Login:", email);
  }
</script>

<h1>Login to DeployX</h1>
<form onsubmit={handleLogin}>
  <label>Email <input type="email" bind:value={email} required /></label>
  <label>Password <input type="password" bind:value={password} required /></label>
  <button type="submit">Login</button>
</form>
<p>Don't have an account? <a href="/register">Register</a></p>
