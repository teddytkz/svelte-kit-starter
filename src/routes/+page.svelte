<script lang="ts">
  import {Button} from "$lib/components/ui/button";
</script>

<h1 class="text-3xl">
  Hello world!
</h1>

<Button>Click Me</Button>
<Button variant="outline">Click Me</Button>
<Button variant="secondary">Click Me</Button>
<style lang="postcss">
  @reference "tailwindcss";
  :global(html) {
    background-color: theme(--color-gray-100);
  }
</style>