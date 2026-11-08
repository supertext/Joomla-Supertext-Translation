<?php

/**
 * @package     Supertext Translation for Joomla
 * @copyright   (C) Supertext AG
 * @license     GNU General Public License version 2 or later
 */

\defined('_JEXEC') or die;

use Joomla\CMS\Extension\PluginInterface;
use Joomla\CMS\Factory;
use Joomla\CMS\Plugin\PluginHelper;
use Joomla\Database\DatabaseInterface;
use Joomla\DI\Container;
use Joomla\DI\ServiceProviderInterface;
use Supertext\Plugin\System\Supertext\Extension\Supertext;

return new class () implements ServiceProviderInterface {
    public function register(Container $container): void
    {
        $container->set(
            PluginInterface::class,
            function (Container $container) {
                $db     = $container->get(DatabaseInterface::class);
                $config = (array) PluginHelper::getPlugin('system', 'supertext');

                // A disabled plugin is booted without its row (its own settings page does that, e.g.
                // right after installing): read the stored settings, so the page can show them.
                if (!isset($config['params'])) {
                    $params = $db->setQuery(
                        $db->getQuery(true)
                            ->select($db->quoteName('params'))
                            ->from($db->quoteName('#__extensions'))
                            ->where($db->quoteName('type') . ' = ' . $db->quote('plugin'))
                            ->where($db->quoteName('folder') . ' = ' . $db->quote('system'))
                            ->where($db->quoteName('element') . ' = ' . $db->quote('supertext'))
                    )->loadResult();
                    $config += ['type' => 'system', 'name' => 'supertext', 'params' => \is_string($params) && $params !== '' ? $params : '{}'];
                }

                $plugin = new Supertext($config);
                $plugin->setApplication(Factory::getApplication());
                $plugin->setDatabase($db);

                return $plugin;
            }
        );
    }
};
