Redmine::Plugin.register :redmine_blitz do
  name 'Redmine Blitz'
  author 'UNCHAINED,LLC'
  description 'Lightning-fast keyboard shortcuts for efficient navigation and operation in Redmine. Multi-language support (Japanese, English, French).'
  version '1.0.0'
  url 'https://github.com/unchained-llc/redmine_blitz'
  author_url 'https://github.com/unchained-llc'
end

class RedmineBlitzViewListener < Redmine::Hook::ViewListener
  def view_layouts_base_html_head(context)
    javascript_include_tag('redmine_blitz', plugin: :redmine_blitz)
  end
end
