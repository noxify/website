<template>
  <Layout>
    <div class="p-6 lg:p-0 lg:w-1/2 mx-auto relative z-10">
      <h1 class="title">
        Say Hello
      </h1>
      <p class="excerpt">
        Got something you'd like to discuss? Fill out the form below and we'll get back to you as soon as possible.
      </p>
      <ContactForm />
    </div>
  </Layout>
</template>

<script>
import ContactForm from '@/components/ContactForm.vue'

export default {
  components: {
    ContactForm
  },
  metaInfo: {
    title: 'Contact Us',
    description: 'Got something to discuss, say hello',
    bodyAttrs: {
      class: 'page contact'
    }
  }
}
</script>

<style>
  .page footer a {
    @apply text-black
  }
  .contact .vue-expand textarea {
    @apply font-sans text-lg
  }
</style>
