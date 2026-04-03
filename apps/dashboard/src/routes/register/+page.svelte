<script lang="ts">
  let name = $state("");
  let email = $state("");
  let password = $state("");

  async function handleRegister() {
    // TODO: implement register API call
    console.log("Register:", name, email);
  }
</script>

<h1>Create a DeployX Account</h1>
<form onsubmit={handleRegister}>
  <label>Name <input type="text" bind:value={name} required /></label>
  <label>Email <input type="email" bind:value={email} required /></label>
  <label>Password <input type="password" bind:value={password} required minlength="8" /></label>
  <button type="submit">Register</button>
</form>
<p>Already have an account? <a href="/login">Login</a></p>
